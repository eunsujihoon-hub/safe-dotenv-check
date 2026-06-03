import fs from "node:fs";

export function parseEnvFile(content) {
  const entries = new Map();

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const withoutExport = line.startsWith("export ") ? line.slice(7) : line;
    const separatorIndex = withoutExport.indexOf("=");
    const key = separatorIndex === -1
      ? withoutExport.trim()
      : withoutExport.slice(0, separatorIndex).trim();

    if (!key) {
      continue;
    }

    const value = separatorIndex === -1 ? "" : withoutExport.slice(separatorIndex + 1).trim();
    entries.set(key, stripWrappingQuotes(value));
  }

  return entries;
}

function stripWrappingQuotes(value) {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === "\"" && last === "\"") || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }

  return value;
}

export function loadEnvFile(filePath) {
  return parseEnvFile(fs.readFileSync(filePath, "utf8"));
}

export function compareEnv(exampleEntries, targetEntries, options = {}) {
  const requiredKeys = [...exampleEntries.keys()];
  const targetKeys = new Set(targetEntries.keys());
  const missing = [];
  const empty = [];

  for (const key of requiredKeys) {
    if (!targetKeys.has(key)) {
      missing.push(key);
      continue;
    }

    if (targetEntries.get(key) === "") {
      empty.push(key);
    }
  }

  const extra = options.allowExtra
    ? []
    : [...targetKeys].filter((key) => !exampleEntries.has(key)).sort();

  return {
    missing,
    empty,
    extra,
    ok: missing.length === 0 && empty.length === 0 && extra.length === 0
  };
}
