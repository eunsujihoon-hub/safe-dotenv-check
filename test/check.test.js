import test from "node:test";
import assert from "node:assert/strict";
import { compareEnv, parseEnvFile } from "../src/check.js";
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

test("compareEnv reports missing empty and extra keys", () => {
  const exampleEntries = parseEnvFile(`
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
    extra: ["DEBUG"],
    ok: false
  });
});

test("compareEnv can ignore extra keys", () => {
  const exampleEntries = parseEnvFile("A=\n");
  const targetEntries = parseEnvFile("A=1\nB=2\n");

  assert.deepEqual(compareEnv(exampleEntries, targetEntries, { allowExtra: true }), {
    missing: [],
    empty: [],
    extra: [],
    ok: true
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
        extra: ["OTHER_KEY"],
        ok: false
      }
    ]
  });

  await fs.rm(tempDir, { recursive: true, force: true });
});
