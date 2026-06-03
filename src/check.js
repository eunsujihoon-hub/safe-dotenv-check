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
    entries.set(key, normalizeValue(value));
  }

  return entries;
}

export function parseExampleFile(content) {
  const requiredEntries = new Map();
  const optionalEntries = new Map();

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const withoutExport = line.startsWith("export ") ? line.slice(7) : line;
    const optional = /(^\?[\w.-]+\s*=)|(\s+#\s*optional\s*$)/i.test(withoutExport);
    const normalizedLine = withoutExport
      .replace(/^\?/, "")
      .replace(/\s+#\s*optional\s*$/i, "");

    const separatorIndex = normalizedLine.indexOf("=");
    const key = separatorIndex === -1
      ? normalizedLine.trim()
      : normalizedLine.slice(0, separatorIndex).trim();

    if (!key) {
      continue;
    }

    const value = separatorIndex === -1 ? "" : normalizedLine.slice(separatorIndex + 1).trim();
    const targetMap = optional ? optionalEntries : requiredEntries;
    targetMap.set(key, normalizeValue(value));
  }

  return {
    requiredEntries,
    optionalEntries,
    allEntries: new Map([...requiredEntries, ...optionalEntries])
  };
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

function normalizeValue(value) {
  return stripWrappingQuotes(stripInlineComment(value).trim());
}

function stripInlineComment(value) {
  let quote = "";
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = "";
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }

    if (char === "#") {
      if (index === 0 || /\s/.test(value[index - 1])) {
        return value.slice(0, index);
      }
    }
  }

  return value;
}

export function loadEnvFile(filePath) {
  return parseEnvFile(fs.readFileSync(filePath, "utf8"));
}

export function loadExampleFile(filePath) {
  return parseExampleFile(fs.readFileSync(filePath, "utf8"));
}

export function compareEnv(exampleEntries, targetEntries, options = {}) {
  const exampleSpec = normalizeExampleSpec(exampleEntries);
  const requiredKeys = [...exampleSpec.requiredEntries.keys()];
  const targetKeys = new Set(targetEntries.keys());
  const missing = [];
  const empty = [];
  const optional = [...exampleSpec.optionalEntries.keys()].sort();

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
    : [...targetKeys].filter((key) => !exampleSpec.allEntries.has(key)).sort();

  return {
    missing,
    empty,
    extra,
    optional,
    ok: missing.length === 0 && empty.length === 0 && extra.length === 0
  };
}

function normalizeExampleSpec(exampleEntries) {
  if (exampleEntries?.requiredEntries && exampleEntries?.optionalEntries && exampleEntries?.allEntries) {
    return exampleEntries;
  }

  return {
    requiredEntries: exampleEntries,
    optionalEntries: new Map(),
    allEntries: exampleEntries
  };
}
