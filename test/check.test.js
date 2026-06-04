import test from "node:test";
import assert from "node:assert/strict";
import { compareEnv, parseEnvFile, parseExampleFile } from "../src/check.js";
import { runCli } from "../src/cli.js";

test("parseEnvFile ignores comments and export prefixes", () => {
  const entries = parseEnvFile(`
# comment
export DATABASE_URL=postgres://localhost
OPENAI_API_KEY="abc123"
FLAG
`);

  assert.equal(entries.get("DATABASE_URL"), "postgres://localhost");
  assert.equal(entries.get("OPENAI_API_KEY"), "abc123");
  assert.equal(entries.get("FLAG"), "");
});

test("parseEnvFile treats inline comments as empty when no value is set", () => {
  const entries = parseEnvFile(`
API_KEY= # comment
EMPTY_QUOTED="" # still empty
PASSWORD="abc#123" # keep quoted hash
URL=https://example.com/#fragment
`);

  assert.equal(entries.get("API_KEY"), "");
  assert.equal(entries.get("EMPTY_QUOTED"), "");
  assert.equal(entries.get("PASSWORD"), "abc#123");
  assert.equal(entries.get("URL"), "https://example.com/#fragment");
});

test("compareEnv reports missing empty and extra keys", () => {
  const exampleEntries = parseExampleFile(`
DATABASE_URL=
OPENAI_API_KEY=
LOG_LEVEL=info
`);
  const targetEntries = parseEnvFile(`
DATABASE_URL=
LOG_LEVEL=debug
DEBUG=true
`);

  assert.deepEqual(compareEnv(exampleEntries, targetEntries), {
    missing: ["OPENAI_API_KEY"],
    empty: ["DATABASE_URL"],
    invalid: [],
    extra: ["DEBUG"],
    optional: [],
    warning: [],
    warnMissing: [],
    warnEmpty: [],
    warnInvalid: [],
    ok: false
  });
});

test("compareEnv can ignore extra keys", () => {
  const exampleEntries = parseExampleFile("A=\n");
  const targetEntries = parseEnvFile("A=1\nB=2\n");

  assert.deepEqual(compareEnv(exampleEntries, targetEntries, { allowExtra: true }), {
    missing: [],
    empty: [],
    invalid: [],
    extra: [],
    optional: [],
    warning: [],
    warnMissing: [],
    warnEmpty: [],
    warnInvalid: [],
    ok: true
  });
});

test("parseExampleFile supports optional keys", () => {
  const example = parseExampleFile(`
DATABASE_URL=
?SENTRY_DSN=
REDIS_URL= # optional
`);

  assert.deepEqual([...example.requiredEntries.keys()], ["DATABASE_URL"]);
  assert.deepEqual([...example.optionalEntries.keys()].sort(), ["REDIS_URL", "SENTRY_DSN"]);
  assert.deepEqual([...example.warningEntries.keys()], []);
});

test("parseExampleFile supports warning-only keys", () => {
  const example = parseExampleFile(`
DATABASE_URL=
!SLACK_WEBHOOK_URL=
OTEL_EXPORTER_OTLP_ENDPOINT= # warn
`);

  assert.deepEqual([...example.requiredEntries.keys()], ["DATABASE_URL"]);
  assert.deepEqual([...example.warningEntries.keys()].sort(), ["OTEL_EXPORTER_OTLP_ENDPOINT", "SLACK_WEBHOOK_URL"]);
});

test("parseExampleFile supports schema directives", () => {
  const example = parseExampleFile(`
PORT=3000 # type=int
APP_URL=https://example.com # type=url
NODE_ENV=development # enum=development|staging|production
FEATURE_FLAGS={} # type=json optional
API_KEY= # pattern=^sk-[a-z0-9]+$
`);

  assert.deepEqual(example.requiredEntries.get("PORT").rules, { type: "int" });
  assert.deepEqual(example.requiredEntries.get("APP_URL").rules, { type: "url" });
  assert.deepEqual(example.requiredEntries.get("NODE_ENV").rules, {
    enum: ["development", "staging", "production"]
  });
  assert.deepEqual(example.optionalEntries.get("FEATURE_FLAGS").rules, { type: "json" });
  assert.deepEqual(example.requiredEntries.get("API_KEY").rules, { pattern: "^sk-[a-z0-9]+$" });
});

test("compareEnv does not fail on missing optional keys", () => {
  const exampleEntries = parseExampleFile(`
DATABASE_URL=
?SENTRY_DSN=
REDIS_URL= # optional
`);
  const targetEntries = parseEnvFile("DATABASE_URL=postgres://local\n");

  assert.deepEqual(compareEnv(exampleEntries, targetEntries), {
    missing: [],
    empty: [],
    invalid: [],
    extra: [],
    optional: ["REDIS_URL", "SENTRY_DSN"],
    warning: [],
    warnMissing: [],
    warnEmpty: [],
    warnInvalid: [],
    ok: true
  });
});

test("compareEnv reports warning-only keys without failing", () => {
  const exampleEntries = parseExampleFile(`
DATABASE_URL=
!SLACK_WEBHOOK_URL=
OTEL_EXPORTER_OTLP_ENDPOINT= # warn
`);
  const targetEntries = parseEnvFile(`
DATABASE_URL=postgres://local
OTEL_EXPORTER_OTLP_ENDPOINT=
`);

  assert.deepEqual(compareEnv(exampleEntries, targetEntries), {
    missing: [],
    empty: [],
    invalid: [],
    extra: [],
    optional: [],
    warning: ["OTEL_EXPORTER_OTLP_ENDPOINT", "SLACK_WEBHOOK_URL"],
    warnMissing: ["SLACK_WEBHOOK_URL"],
    warnEmpty: ["OTEL_EXPORTER_OTLP_ENDPOINT"],
    warnInvalid: [],
    ok: true
  });
});

test("compareEnv fails when a required key only has an inline comment", () => {
  const exampleEntries = parseExampleFile("API_KEY=\n");
  const targetEntries = parseEnvFile("API_KEY= # comment\n");

  assert.deepEqual(compareEnv(exampleEntries, targetEntries), {
    missing: [],
    empty: ["API_KEY"],
    invalid: [],
    extra: [],
    optional: [],
    warning: [],
    warnMissing: [],
    warnEmpty: [],
    warnInvalid: [],
    ok: false
  });
});

test("compareEnv validates typed schema rules", () => {
  const exampleEntries = parseExampleFile(`
PORT=3000 # type=int
APP_URL=https://example.com # type=url
NODE_ENV=development # enum=development|staging|production
API_KEY= # pattern=^sk-[a-z0-9]+$
?FEATURE_FLAGS={} # type=json
!OTEL_EXPORTER_OTLP_ENDPOINT=https://collector.example.com # type=url
`);
  const targetEntries = parseEnvFile(`
PORT=abc
APP_URL=not-a-url
NODE_ENV=preview
API_KEY=bad
FEATURE_FLAGS={not-json}
OTEL_EXPORTER_OTLP_ENDPOINT=collector
`);

  assert.deepEqual(compareEnv(exampleEntries, targetEntries), {
    missing: [],
    empty: [],
    invalid: [
      { key: "PORT", value: "abc", expected: "type=int" },
      { key: "APP_URL", value: "not-a-url", expected: "type=url" },
      { key: "NODE_ENV", value: "preview", expected: "enum=development|staging|production" },
      { key: "API_KEY", value: "bad", expected: "pattern=^sk-[a-z0-9]+$" },
      { key: "FEATURE_FLAGS", value: "{not-json}", expected: "type=json" }
    ],
    extra: [],
    optional: ["FEATURE_FLAGS"],
    warning: ["OTEL_EXPORTER_OTLP_ENDPOINT"],
    warnMissing: [],
    warnEmpty: [],
    warnInvalid: [
      { key: "OTEL_EXPORTER_OTLP_ENDPOINT", value: "collector", expected: "type=url" }
    ],
    ok: false
  });
});

test("runCli supports json output", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "safe-dotenv-check-"));
  const examplePath = path.join(tempDir, ".env.example");
  const envPath = path.join(tempDir, ".env");

  await fs.writeFile(examplePath, "API_KEY=\n");
  await fs.writeFile(envPath, "OTHER_KEY=1\n");

  let stdout = "";
  let stderr = "";
  const exitCode = runCli(
    ["--example", examplePath, "--env", envPath, "--format", "json"],
    { write(chunk) { stdout += chunk; } },
    { write(chunk) { stderr += chunk; } }
  );

  assert.equal(exitCode, 1);
  assert.equal(stderr, "");
  assert.deepEqual(JSON.parse(stdout), {
    ok: false,
    example: examplePath,
    files: [
      {
        file: envPath,
        missing: ["API_KEY"],
        empty: [],
        invalid: [],
        extra: ["OTHER_KEY"],
        optional: [],
        warning: [],
        warnMissing: [],
        warnEmpty: [],
        warnInvalid: [],
        ok: false
      }
    ]
  });

  await fs.rm(tempDir, { recursive: true, force: true });
});

test("runCli prints warning-only findings without failing", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "safe-dotenv-check-"));
  const examplePath = path.join(tempDir, ".env.example");
  const envPath = path.join(tempDir, ".env");

  await fs.writeFile(examplePath, "DATABASE_URL=\n!SLACK_WEBHOOK_URL=\n");
  await fs.writeFile(envPath, "DATABASE_URL=postgres://local\n");

  let stdout = "";
  let stderr = "";
  const exitCode = runCli(
    ["--example", examplePath, "--env", envPath],
    { write(chunk) { stdout += chunk; } },
    { write(chunk) { stderr += chunk; } }
  );

  assert.equal(exitCode, 0);
  assert.equal(stderr, "");
  assert.equal(stdout, `WARN ${envPath}\n  warn-missing: SLACK_WEBHOOK_URL\n`);

  await fs.rm(tempDir, { recursive: true, force: true });
});

test("runCli prints invalid schema details", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "safe-dotenv-check-"));
  const examplePath = path.join(tempDir, ".env.example");
  const envPath = path.join(tempDir, ".env");

  await fs.writeFile(examplePath, "PORT=3000 # type=int\n");
  await fs.writeFile(envPath, "PORT=abc\n");

  let stdout = "";
  let stderr = "";
  const exitCode = runCli(
    ["--example", examplePath, "--env", envPath],
    { write(chunk) { stdout += chunk; } },
    { write(chunk) { stderr += chunk; } }
  );

  assert.equal(exitCode, 1);
  assert.equal(stderr, "");
  assert.equal(stdout, `FAIL ${envPath}\n  invalid: PORT (type=int)\n`);

  await fs.rm(tempDir, { recursive: true, force: true });
});
