import test from "node:test";
import assert from "node:assert/strict";
import { analyzeExampleCoverage, compareEnv, generateExampleFromEnv, lintExampleFile, parseEnvFile, parseExampleFile } from "../src/check.js";
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
WORKER_COUNT=2 # type=integer
API_KEY= # pattern=^sk-[a-z0-9]+$
`);

  assert.deepEqual(example.requiredEntries.get("PORT").rules, { type: "int" });
  assert.deepEqual(example.requiredEntries.get("APP_URL").rules, { type: "url" });
  assert.deepEqual(example.requiredEntries.get("NODE_ENV").rules, {
    enum: ["development", "staging", "production"]
  });
  assert.deepEqual(example.optionalEntries.get("FEATURE_FLAGS").rules, { type: "json" });
  assert.deepEqual(example.requiredEntries.get("WORKER_COUNT").rules, { type: "int" });
  assert.deepEqual(example.requiredEntries.get("API_KEY").rules, { pattern: "^sk-[a-z0-9]+$" });
});

test("parseExampleFile supports env-specific entries and descriptions", () => {
  const example = parseExampleFile(`
DATABASE_URL=postgres://localhost/app # type=url desc="Shared database connection"
?SENTRY_DSN= # env=dev desc=Local error tracking only
SENTRY_DSN= # env=production desc=Production error tracking DSN
!DEPLOY_WEBHOOK_URL= # env=staging|production description="Deploy webhook for notifications"
`);

  assert.equal(example.requiredEntries.get("DATABASE_URL").description, "Shared database connection");
  assert.equal(example.requiredEntries.get("DATABASE_URL").envs.length, 0);
  assert.equal(example.optionalEntries.get("SENTRY_DSN"), undefined);
  assert.equal(example.requiredEntries.get("SENTRY_DSN"), undefined);
  assert.equal(example.entries[1].description, "Local error tracking only");
  assert.deepEqual(example.entries[1].envs, ["dev"]);
  assert.equal(example.entries[2].description, "Production error tracking DSN");
  assert.deepEqual(example.entries[2].envs, ["production"]);
  assert.equal(example.entries[3].description, "Deploy webhook for notifications");
  assert.deepEqual(example.entries[3].envs, ["staging", "production"]);
});

test("parseExampleFile does not treat description text as directives", () => {
  const example = parseExampleFile(`
API_KEY= # desc="optional warning string number env=dev should stay description text"
`);

  assert.deepEqual([...example.requiredEntries.keys()], ["API_KEY"]);
  assert.deepEqual([...example.optionalEntries.keys()], []);
  assert.deepEqual([...example.warningEntries.keys()], []);
  assert.deepEqual(example.requiredEntries.get("API_KEY").rules, {});
  assert.equal(
    example.requiredEntries.get("API_KEY").description,
    "optional warning string number env=dev should stay description text"
  );
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

test("compareEnv can include manifest descriptions in reports", () => {
  const exampleEntries = parseExampleFile(`
DATABASE_URL= # desc="Primary Postgres connection"
?SENTRY_DSN= # desc=Optional error tracking DSN
`);
  const targetEntries = parseEnvFile("SENTRY_DSN=https://example.com\n");

  assert.deepEqual(compareEnv(exampleEntries, targetEntries, { includeDescriptions: true }), {
    missing: ["DATABASE_URL"],
    empty: [],
    invalid: [],
    extra: [],
    optional: ["SENTRY_DSN"],
    warning: [],
    warnMissing: [],
    warnEmpty: [],
    warnInvalid: [],
    ok: false,
    descriptions: {
      DATABASE_URL: "Primary Postgres connection",
      SENTRY_DSN: "Optional error tracking DSN"
    }
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

test("compareEnv validates remaining built-in schema types", () => {
  const exampleEntries = parseExampleFile(`
SERVICE_NAME=api # type=string
TIMEOUT_SECONDS=1.5 # type=number
FEATURE_ENABLED=true # type=boolean
`);
  const validEntries = parseEnvFile(`
SERVICE_NAME=
TIMEOUT_SECONDS=2.75
FEATURE_ENABLED=on
`);
  const invalidEntries = parseEnvFile(`
SERVICE_NAME=api
TIMEOUT_SECONDS=abc
FEATURE_ENABLED=maybe
`);

  assert.deepEqual(compareEnv(exampleEntries, validEntries), {
    missing: [],
    empty: ["SERVICE_NAME"],
    invalid: [],
    extra: [],
    optional: [],
    warning: [],
    warnMissing: [],
    warnEmpty: [],
    warnInvalid: [],
    ok: false
  });

  assert.deepEqual(compareEnv(exampleEntries, invalidEntries), {
    missing: [],
    empty: [],
    invalid: [
      { key: "TIMEOUT_SECONDS", value: "abc", expected: "type=number" },
      { key: "FEATURE_ENABLED", value: "maybe", expected: "type=boolean" }
    ],
    extra: [],
    optional: [],
    warning: [],
    warnMissing: [],
    warnEmpty: [],
    warnInvalid: [],
    ok: false
  });
});

test("compareEnv resolves env-specific tiers for the selected env name", () => {
  const exampleEntries = parseExampleFile(`
DATABASE_URL=postgres://localhost/app # type=url desc="Shared database connection"
?SENTRY_DSN= # env=dev desc=Local error tracking only
SENTRY_DSN= # env=production desc=Production error tracking DSN
!SLACK_WEBHOOK_URL= # env=staging,production desc="Deploy notifications"
`);

  const devTargetEntries = parseEnvFile("DATABASE_URL=postgres://localhost/app\n");
  const productionTargetEntries = parseEnvFile("DATABASE_URL=postgres://localhost/app\n");

  assert.deepEqual(compareEnv(exampleEntries, devTargetEntries, { envName: "dev" }), {
    missing: [],
    empty: [],
    invalid: [],
    extra: [],
    optional: ["SENTRY_DSN"],
    warning: [],
    warnMissing: [],
    warnEmpty: [],
    warnInvalid: [],
    envName: "dev",
    ok: true
  });

  assert.deepEqual(compareEnv(exampleEntries, productionTargetEntries, { envName: "production" }), {
    missing: ["SENTRY_DSN"],
    empty: [],
    invalid: [],
    extra: [],
    optional: [],
    warning: ["SLACK_WEBHOOK_URL"],
    warnMissing: ["SLACK_WEBHOOK_URL"],
    warnEmpty: [],
    warnInvalid: [],
    envName: "production",
    ok: false
  });
});

test("generateExampleFromEnv infers common schema directives", () => {
  const entries = parseEnvFile(`
DATABASE_URL=postgres://localhost/app
FEATURE_ENABLED=true
FEATURE_FLAGS={"checkout":true}
PORT=3000
TIMEOUT_SECONDS=2.5
API_KEY=secret
`);

  assert.equal(generateExampleFromEnv(entries), `API_KEY=
DATABASE_URL= # type=url
FEATURE_ENABLED= # type=boolean
FEATURE_FLAGS= # type=json
PORT= # type=int
TIMEOUT_SECONDS= # type=number
`);
});

test("generateExampleFromEnv keeps key-based rules ahead of misleading values", () => {
  const entries = parseEnvFile(`
DATABASE_URL=123
PORT=https://example.com
NODE_ENV=true
API_KEY=123456
AUTH_TOKEN=true
PRIVATE_KEY={"kty":"RSA"}
`);

  assert.equal(generateExampleFromEnv(entries), `API_KEY=
AUTH_TOKEN=
DATABASE_URL= # type=url
NODE_ENV= # enum=development|test|production
PORT= # type=int
PRIVATE_KEY=
`);
});

test("generateExampleFromEnv adds framework preset hints", () => {
  const entries = parseEnvFile("API_KEY=secret\n");

  assert.equal(generateExampleFromEnv(entries, { preset: "nextjs" }), `API_KEY=
DATABASE_URL= # type=url desc="Primary database connection"
NEXT_PUBLIC_API_BASE_URL= # type=url desc="Browser-exposed API base URL"
NEXT_PUBLIC_APP_URL= # type=url desc="Browser-exposed app URL"
NODE_ENV= # enum=development|test|production
`);
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
        ok: false,
        actions: [
          `add API_KEY to ${envPath}`,
          "remove OTHER_KEY from the target env file, add it to the manifest, or use --extra warn/ignore"
        ]
      }
    ]
  });

  await fs.rm(tempDir, { recursive: true, force: true });
});

test("runCli can show descriptions in text and json output", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "safe-dotenv-check-"));
  const examplePath = path.join(tempDir, ".env.example");
  const envPath = path.join(tempDir, ".env");

  await fs.writeFile(examplePath, "API_KEY= # desc=\"Server API credential\"\n");
  await fs.writeFile(envPath, "\n");

  let stdout = "";
  let stderr = "";
  const textExitCode = runCli(
    ["--example", examplePath, "--env", envPath, "--show-descriptions"],
    { write(chunk) { stdout += chunk; } },
    { write(chunk) { stderr += chunk; } }
  );

  assert.equal(textExitCode, 1);
  assert.equal(stderr, "");
  assert.equal(stdout, `FAIL ${envPath}
  missing: API_KEY - Server API credential
  next:
    - add API_KEY to ${envPath}
`);

  stdout = "";
  stderr = "";
  const jsonExitCode = runCli(
    ["--example", examplePath, "--env", envPath, "--show-descriptions", "--format", "json"],
    { write(chunk) { stdout += chunk; } },
    { write(chunk) { stderr += chunk; } }
  );

  assert.equal(jsonExitCode, 1);
  assert.equal(stderr, "");
  assert.deepEqual(JSON.parse(stdout).files[0].descriptions, {
    API_KEY: "Server API credential"
  });

  await fs.rm(tempDir, { recursive: true, force: true });
});

test("runCli discovers default .env.example and .env paths", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "safe-dotenv-check-"));
  const previousCwd = process.cwd();

  await fs.writeFile(path.join(tempDir, ".env.example"), "API_KEY=\n");
  await fs.writeFile(path.join(tempDir, ".env"), "API_KEY=test\n");

  process.chdir(tempDir);

  let stdout = "";
  let stderr = "";
  const exitCode = runCli(
    [],
    { write(chunk) { stdout += chunk; } },
    { write(chunk) { stderr += chunk; } }
  );

  process.chdir(previousCwd);

  assert.equal(exitCode, 0);
  assert.equal(stderr, "");
  assert.equal(stdout, "PASS .env\n");

  await fs.rm(tempDir, { recursive: true, force: true });
});

test("runCli applies env-specific manifest entries and includes envName in json output", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "safe-dotenv-check-"));
  const examplePath = path.join(tempDir, ".env.example");
  const envPath = path.join(tempDir, ".env.production");

  await fs.writeFile(examplePath, "API_KEY= # env=production desc=Public API credential\n");
  await fs.writeFile(envPath, "OTHER_KEY=1\n");

  let stdout = "";
  let stderr = "";
  const exitCode = runCli(
    ["--example", examplePath, "--env", envPath, "--env-name", "production", "--format", "json"],
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
        envName: "production",
        ok: false,
        actions: [
          `add API_KEY to ${envPath}`,
          "remove OTHER_KEY from the target env file, add it to the manifest, or use --extra warn/ignore"
        ]
      }
    ]
  });

  await fs.rm(tempDir, { recursive: true, force: true });
});

test("runCli treats positional arguments as env paths and infers env names", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "safe-dotenv-check-"));
  const examplePath = path.join(tempDir, ".env.example");
  const envPath = path.join(tempDir, ".env.production");

  await fs.writeFile(examplePath, "API_KEY= # env=production\n");
  await fs.writeFile(envPath, "OTHER_KEY=1\n");

  let stdout = "";
  let stderr = "";
  const exitCode = runCli(
    ["--example", examplePath, envPath, "--format", "json"],
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
        envName: "production",
        ok: false,
        actions: [
          `add API_KEY to ${envPath}`,
          "remove OTHER_KEY from the target env file, add it to the manifest, or use --extra warn/ignore"
        ]
      }
    ]
  });

  await fs.rm(tempDir, { recursive: true, force: true });
});

test("runCli rejects mismatched env-name counts", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "safe-dotenv-check-"));
  const examplePath = path.join(tempDir, ".env.example");
  const envPath = path.join(tempDir, ".env");

  await fs.writeFile(examplePath, "API_KEY=\n");
  await fs.writeFile(envPath, "API_KEY=test\n");

  let stdout = "";
  let stderr = "";
  const exitCode = runCli(
    [
      "--example", examplePath,
      "--env", envPath,
      "--env-name", "dev",
      "--env-name", "production"
    ],
    { write(chunk) { stdout += chunk; } },
    { write(chunk) { stderr += chunk; } }
  );

  assert.equal(exitCode, 2);
  assert.equal(stdout, "");
  assert.match(stderr, /--env-name must be provided once or once per --env/);

  await fs.rm(tempDir, { recursive: true, force: true });
});

test("runCli rejects missing option values before validation", async () => {
  for (const option of ["--example", "--env", "--env-name", "--extra", "--format", "--out", "--preset"]) {
    let stdout = "";
    let stderr = "";
    const exitCode = runCli(
      [option, "--doctor"],
      { write(chunk) { stdout += chunk; } },
      { write(chunk) { stderr += chunk; } }
    );

    assert.equal(exitCode, 2);
    assert.equal(stdout, "");
    assert.match(stderr, new RegExp(`missing value for ${option}`));
  }
});

test("runCli supports allow-extra for success paths", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "safe-dotenv-check-"));
  const examplePath = path.join(tempDir, ".env.example");
  const envPath = path.join(tempDir, ".env");

  await fs.writeFile(examplePath, "API_KEY=\n");
  await fs.writeFile(envPath, "API_KEY=test\nEXTRA_KEY=1\n");

  let stdout = "";
  let stderr = "";
  const exitCode = runCli(
    ["--example", examplePath, "--env", envPath, "--allow-extra"],
    { write(chunk) { stdout += chunk; } },
    { write(chunk) { stderr += chunk; } }
  );

  assert.equal(exitCode, 0);
  assert.equal(stderr, "");
  assert.equal(stdout, `PASS ${envPath}\n`);

  await fs.rm(tempDir, { recursive: true, force: true });
});

test("runCli quiet mode hides clean text reports but keeps warnings", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "safe-dotenv-check-"));
  const examplePath = path.join(tempDir, ".env.example");
  const cleanEnvPath = path.join(tempDir, ".env.clean");
  const warnEnvPath = path.join(tempDir, ".env.warn");

  await fs.writeFile(examplePath, "DATABASE_URL=\n!SLACK_WEBHOOK_URL=\n");
  await fs.writeFile(cleanEnvPath, "DATABASE_URL=postgres://local\nSLACK_WEBHOOK_URL=https://hooks.example.com\n");
  await fs.writeFile(warnEnvPath, "DATABASE_URL=postgres://local\n");

  let stdout = "";
  let stderr = "";
  const exitCode = runCli(
    ["--example", examplePath, "--env", cleanEnvPath, "--env", warnEnvPath, "--quiet"],
    { write(chunk) { stdout += chunk; } },
    { write(chunk) { stderr += chunk; } }
  );

  assert.equal(exitCode, 0);
  assert.equal(stderr, "");
  assert.equal(stdout, `WARN ${warnEnvPath} (warn)
  warn-missing: SLACK_WEBHOOK_URL
  next:
    - optionally add warning-only key SLACK_WEBHOOK_URL
`);

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
  assert.equal(stdout, `WARN ${envPath}
  warn-missing: SLACK_WEBHOOK_URL
  next:
    - optionally add warning-only key SLACK_WEBHOOK_URL
`);

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
  assert.equal(stdout, `FAIL ${envPath}
  invalid: PORT (type=int)
  next:
    - update PORT to match type=int
`);

  await fs.rm(tempDir, { recursive: true, force: true });
});

test("runCli supports warn extra mode without failing", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "safe-dotenv-check-"));
  const examplePath = path.join(tempDir, ".env.example");
  const envPath = path.join(tempDir, ".env");

  await fs.writeFile(examplePath, "API_KEY=\n");
  await fs.writeFile(envPath, "API_KEY=test\nEXTRA_KEY=1\n");

  let stdout = "";
  let stderr = "";
  const exitCode = runCli(
    ["--example", examplePath, "--env", envPath, "--extra", "warn"],
    { write(chunk) { stdout += chunk; } },
    { write(chunk) { stderr += chunk; } }
  );

  assert.equal(exitCode, 0);
  assert.equal(stderr, "");
  assert.equal(stdout, `WARN ${envPath}
  warn-extra: EXTRA_KEY
  next:
    - review extra key EXTRA_KEY; add it to the manifest if it is intentional
`);

  await fs.rm(tempDir, { recursive: true, force: true });
});

test("runCli can redact invalid values from json output", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "safe-dotenv-check-"));
  const examplePath = path.join(tempDir, ".env.example");
  const envPath = path.join(tempDir, ".env");

  await fs.writeFile(examplePath, "API_KEY= # pattern=^sk-[a-z0-9]+$\n");
  await fs.writeFile(envPath, "API_KEY=secret-value\n");

  let stdout = "";
  let stderr = "";
  const exitCode = runCli(
    ["--example", examplePath, "--env", envPath, "--format", "json", "--redact-values"],
    { write(chunk) { stdout += chunk; } },
    { write(chunk) { stderr += chunk; } }
  );

  assert.equal(exitCode, 1);
  assert.equal(stderr, "");
  assert.deepEqual(JSON.parse(stdout).files[0].invalid, [
    { key: "API_KEY", expected: "pattern=^sk-[a-z0-9]+$" }
  ]);

  await fs.rm(tempDir, { recursive: true, force: true });
});

test("runCli can initialize and sync example files", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "safe-dotenv-check-"));
  const envPath = path.join(tempDir, ".env.local");
  const examplePath = path.join(tempDir, ".env.example");

  await fs.writeFile(envPath, "DATABASE_URL=postgres://local\nAPI_KEY=secret\n");

  let stdout = "";
  let stderr = "";
  const initExitCode = runCli(
    ["--init", "--env", envPath, "--out", examplePath],
    { write(chunk) { stdout += chunk; } },
    { write(chunk) { stderr += chunk; } }
  );

  assert.equal(initExitCode, 0);
  assert.equal(stderr, "");
  assert.equal(await fs.readFile(examplePath, "utf8"), "API_KEY=\nDATABASE_URL= # type=url\n");

  await fs.writeFile(envPath, "DATABASE_URL=postgres://local\nAPI_KEY=secret\nNEW_KEY=value\n");
  stdout = "";
  stderr = "";
  const syncExitCode = runCli(
    ["--sync-example", "--example", examplePath, "--env", envPath, "--write"],
    { write(chunk) { stdout += chunk; } },
    { write(chunk) { stderr += chunk; } }
  );

  assert.equal(syncExitCode, 0);
  assert.equal(stderr, "");
  assert.equal(await fs.readFile(examplePath, "utf8"), "API_KEY=\nDATABASE_URL= # type=url\nNEW_KEY=\n");

  await fs.rm(tempDir, { recursive: true, force: true });
});

test("generateExampleFromEnv avoids value rules for compact secret-like keys", () => {
  const content = generateExampleFromEnv(parseEnvFile(`
OPENAI_APIKEY=123
CLIENT_SECRET=true
JWTSECRET={"alg":"HS256"}
AUTH_TOKEN=false
ACCESSKEY=42
TURKEY_COUNT=2
`));

  assert.equal(content, `ACCESSKEY=
AUTH_TOKEN=
CLIENT_SECRET=
JWTSECRET=
OPENAI_APIKEY=
TURKEY_COUNT= # type=int
`);
});

test("runCli sync preview matches generated missing lines", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "safe-dotenv-check-"));
  const envPath = path.join(tempDir, ".env.local");
  const examplePath = path.join(tempDir, ".env.example");

  await fs.writeFile(examplePath, "API_KEY=\n");
  await fs.writeFile(envPath, "API_KEY=secret\nAPP_URL=https://example.com\nFEATURE_ENABLED=true\n");

  let stdout = "";
  let stderr = "";
  const exitCode = runCli(
    ["--sync-example", "--example", examplePath, "--env", envPath],
    { write(chunk) { stdout += chunk; } },
    { write(chunk) { stderr += chunk; } }
  );

  assert.equal(exitCode, 1);
  assert.equal(stderr, "");
  assert.equal(stdout, `missing from ${examplePath}:
  + APP_URL= # type=url
  + FEATURE_ENABLED= # type=boolean
run again with --write to append these keys
`);

  await fs.rm(tempDir, { recursive: true, force: true });
});

test("analyzeExampleCoverage reports missing and stale keys across env files", () => {
  const result = analyzeExampleCoverage("API_KEY=\nOLD_KEY=\n", [
    {
      file: ".env.local",
      entries: parseEnvFile("API_KEY=secret\nLOCAL_ONLY=1\n")
    },
    {
      file: ".env.production",
      entries: parseEnvFile("API_KEY=secret\nPRODUCTION_ONLY=1\n")
    }
  ]);

  assert.deepEqual(result, {
    ok: false,
    files: [
      {
        file: ".env.local",
        missingFromExample: ["LOCAL_ONLY"]
      },
      {
        file: ".env.production",
        missingFromExample: ["PRODUCTION_ONLY"]
      }
    ],
    staleInExample: ["OLD_KEY"]
  });
});

test("runCli sync supports multiple env files and json output", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "safe-dotenv-check-"));
  const localEnvPath = path.join(tempDir, ".env.local");
  const productionEnvPath = path.join(tempDir, ".env.production");
  const examplePath = path.join(tempDir, ".env.example");

  await fs.writeFile(examplePath, "API_KEY=\nOLD_KEY=\n");
  await fs.writeFile(localEnvPath, "API_KEY=secret\nAPP_URL=http://localhost:3000\n");
  await fs.writeFile(productionEnvPath, "API_KEY=secret\nDATABASE_URL=postgres://prod\n");

  let stdout = "";
  let stderr = "";
  const exitCode = runCli(
    [
      "--sync",
      "--example", examplePath,
      "--env", localEnvPath,
      "--env", productionEnvPath,
      "--format", "json"
    ],
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
        file: localEnvPath,
        missingFromExample: ["APP_URL"]
      },
      {
        file: productionEnvPath,
        missingFromExample: ["DATABASE_URL"]
      }
    ],
    added: ["APP_URL", "DATABASE_URL"],
    staleInExample: ["OLD_KEY"],
    written: false
  });

  await fs.rm(tempDir, { recursive: true, force: true });
});

test("runCli sync writes before emitting json output", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "safe-dotenv-check-"));
  const envPath = path.join(tempDir, ".env.local");
  const examplePath = path.join(tempDir, ".env.example");

  await fs.writeFile(examplePath, "API_KEY=\n");
  await fs.writeFile(envPath, "API_KEY=secret\nAPP_URL=http://localhost:3000\n");

  let stdout = "";
  let stderr = "";
  const exitCode = runCli(
    ["--sync", "--write", "--format", "json", "--example", examplePath, "--env", envPath],
    { write(chunk) { stdout += chunk; } },
    { write(chunk) { stderr += chunk; } }
  );

  assert.equal(exitCode, 0);
  assert.equal(stderr, "");
  assert.equal(JSON.parse(stdout).written, true);
  assert.equal(await fs.readFile(examplePath, "utf8"), `API_KEY=
APP_URL= # type=url
`.replace(/^\+/gm, ""));

  await fs.rm(tempDir, { recursive: true, force: true });
});

test("runCli sync writes merged missing keys with first source annotations", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "safe-dotenv-check-"));
  const localEnvPath = path.join(tempDir, ".env.local");
  const productionEnvPath = path.join(tempDir, ".env.production");
  const examplePath = path.join(tempDir, ".env.example");

  await fs.writeFile(examplePath, "API_KEY=\n");
  await fs.writeFile(localEnvPath, "API_KEY=secret\nAPP_URL=http://localhost:3000\n");
  await fs.writeFile(productionEnvPath, "API_KEY=secret\nDATABASE_URL=postgres://prod\n");

  let stdout = "";
  let stderr = "";
  const exitCode = runCli(
    [
      "--sync",
      "--write",
      "--annotate",
      "--example", examplePath,
      "--env", localEnvPath,
      "--env", productionEnvPath
    ],
    { write(chunk) { stdout += chunk; } },
    { write(chunk) { stderr += chunk; } }
  );

  assert.equal(exitCode, 0);
  assert.equal(stderr, "");
  assert.equal(stdout, `updated ${examplePath}; added APP_URL, DATABASE_URL\n`);
  assert.equal(await fs.readFile(examplePath, "utf8"), `API_KEY=
APP_URL= # type=url added-by=safe-dotenv-check source=${localEnvPath}
DATABASE_URL= # type=url added-by=safe-dotenv-check source=${productionEnvPath}
`.replace(/^\+/gm, ""));

  await fs.rm(tempDir, { recursive: true, force: true });
});

test("runCli supports write-missing alias and annotations", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "safe-dotenv-check-"));
  const envPath = path.join(tempDir, ".env.local");
  const examplePath = path.join(tempDir, ".env.example");

  await fs.writeFile(examplePath, "API_KEY=\n");
  await fs.writeFile(envPath, "API_KEY=secret\nAPP_URL=https://example.com\n");

  let stdout = "";
  let stderr = "";
  const exitCode = runCli(
    ["--write-missing", "--annotate", "--example", examplePath, "--env", envPath],
    { write(chunk) { stdout += chunk; } },
    { write(chunk) { stderr += chunk; } }
  );

  assert.equal(exitCode, 0);
  assert.equal(stderr, "");
  assert.equal(await fs.readFile(examplePath, "utf8"), `API_KEY=
APP_URL= # type=url added-by=safe-dotenv-check source=${envPath}
`);

  await fs.rm(tempDir, { recursive: true, force: true });
});

test("runCli quotes annotation sources with spaces", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "safe dotenv check-"));
  const envPath = path.join(tempDir, ".env local");
  const examplePath = path.join(tempDir, ".env.example");

  await fs.writeFile(examplePath, "API_KEY=\n");
  await fs.writeFile(envPath, "API_KEY=secret\nAPP_URL=https://example.com\n");

  let stdout = "";
  let stderr = "";
  const exitCode = runCli(
    ["--write-missing", "--annotate", "--example", examplePath, "--env", envPath],
    { write(chunk) { stdout += chunk; } },
    { write(chunk) { stderr += chunk; } }
  );

  assert.equal(exitCode, 0);
  assert.equal(stderr, "");
  assert.equal(await fs.readFile(examplePath, "utf8"), `API_KEY=
APP_URL= # type=url added-by=safe-dotenv-check source="${envPath}"
`);

  await fs.rm(tempDir, { recursive: true, force: true });
});

test("runCli doctor reports invalid manifest directives", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "safe-dotenv-check-"));
  const examplePath = path.join(tempDir, ".env.example");

  await fs.writeFile(examplePath, "API_KEY= # pattern=[\n");

  let stdout = "";
  let stderr = "";
  const exitCode = runCli(
    ["--doctor", "--example", examplePath],
    { write(chunk) { stdout += chunk; } },
    { write(chunk) { stderr += chunk; } }
  );

  assert.equal(exitCode, 1);
  assert.equal(stderr, "");
  assert.match(stdout, /invalid regex pattern/);

  await fs.rm(tempDir, { recursive: true, force: true });
});

test("lintExampleFile warns about overlapping duplicate keys", () => {
  const result = lintExampleFile(`
API_KEY=
API_KEY= # optional
SENTRY_DSN= # env=production
?SENTRY_DSN= # env=dev
SLACK_WEBHOOK_URL= # env=staging,production
!SLACK_WEBHOOK_URL= # env=production
`);

  assert.equal(result.ok, true);
  assert.deepEqual(result.findings, [
    {
      line: 3,
      key: "API_KEY",
      level: "warning",
      message: "duplicate key overlaps with line 2; later entry wins"
    },
    {
      line: 7,
      key: "SLACK_WEBHOOK_URL",
      level: "warning",
      message: "duplicate key overlaps with line 6; later entry wins"
    }
  ]);
});

test("lintExampleFile warns about ambiguous tiers and unknown directives", () => {
  const result = lintExampleFile(`
?SLACK_WEBHOOK_URL= # warn
API_KEY= # typ=string descc="API key"
APP_URL= # type=url added-by=safe-dotenv-check source=".env local"
`);

  assert.equal(result.ok, true);
  assert.deepEqual(result.findings, [
    {
      line: 2,
      key: "SLACK_WEBHOOK_URL",
      level: "warning",
      message: "optional and warning tiers are both set; optional tier wins"
    },
    {
      line: 3,
      key: "API_KEY",
      level: "warning",
      message: "unknown directive: typ=string (did you mean type=?)"
    },
    {
      line: 3,
      key: "API_KEY",
      level: "warning",
      message: "unknown directive: descc=\"API key\" (did you mean desc=?)"
    }
  ]);
});
