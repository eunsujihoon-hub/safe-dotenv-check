import test from "node:test";
import assert from "node:assert/strict";
import { compareEnv, parseEnvFile } from "../src/check.js";

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
