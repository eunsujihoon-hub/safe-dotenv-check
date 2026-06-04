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
  const entries = [];

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const withoutExport = line.startsWith("export ") ? line.slice(7) : line;
    const optionalPrefix = withoutExport.startsWith("?");
    const warningPrefix = withoutExport.startsWith("!");
    const normalizedLine = withoutExport
      .replace(/^\?/, "")
      .replace(/^!/, "");

    const separatorIndex = normalizedLine.indexOf("=");
    const key = separatorIndex === -1
      ? normalizedLine.trim()
      : normalizedLine.slice(0, separatorIndex).trim();

    if (!key) {
      continue;
    }

    const rawValue = separatorIndex === -1 ? "" : normalizedLine.slice(separatorIndex + 1).trim();
    const { value, comment } = splitValueAndComment(rawValue);
    const directives = parseManifestDirectives(comment);
    const optional = optionalPrefix || directives.optional;
    const warning = warningPrefix || directives.warning;
    entries.push({
      key,
      exampleValue: normalizeValue(value),
      rules: directives.rules,
      description: directives.description,
      envs: directives.envs,
      tier: optional
        ? "optional"
        : warning
          ? "warning"
          : "required"
    });
  }

  return {
    entries,
    ...buildResolvedSpec(entries)
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
  const exampleSpec = normalizeExampleSpec(exampleEntries, options.envName);
  const requiredKeys = [...exampleSpec.requiredEntries.keys()];
  const warningKeys = [...exampleSpec.warningEntries.keys()];
  const optionalKeys = [...exampleSpec.optionalEntries.keys()];
  const targetKeys = new Set(targetEntries.keys());
  const missing = [];
  const empty = [];
  const optional = [...optionalKeys].sort();
  const warning = [...exampleSpec.warningEntries.keys()].sort();
  const warnMissing = [];
  const warnEmpty = [];
  const invalid = [];
  const warnInvalid = [];

  for (const key of requiredKeys) {
    if (!targetKeys.has(key)) {
      missing.push(key);
      continue;
    }

    if (targetEntries.get(key) === "") {
      empty.push(key);
      continue;
    }

    const failure = validateValueAgainstRules(
      key,
      targetEntries.get(key),
      exampleSpec.requiredEntries.get(key)?.rules,
      exampleSpec.requiredEntries.get(key)?.description
    );
    if (failure) {
      invalid.push(failure);
    }
  }

  for (const key of warningKeys) {
    if (!targetKeys.has(key)) {
      warnMissing.push(key);
      continue;
    }

    if (targetEntries.get(key) === "") {
      warnEmpty.push(key);
      continue;
    }

    const failure = validateValueAgainstRules(
      key,
      targetEntries.get(key),
      exampleSpec.warningEntries.get(key)?.rules,
      exampleSpec.warningEntries.get(key)?.description
    );
    if (failure) {
      warnInvalid.push(failure);
    }
  }

  for (const key of optionalKeys) {
    if (!targetKeys.has(key)) {
      continue;
    }

    if (targetEntries.get(key) === "") {
      continue;
    }

    const failure = validateValueAgainstRules(
      key,
      targetEntries.get(key),
      exampleSpec.optionalEntries.get(key)?.rules,
      exampleSpec.optionalEntries.get(key)?.description
    );
    if (failure) {
      invalid.push(failure);
    }
  }

  const extra = options.allowExtra
    ? []
    : [...targetKeys].filter((key) => !exampleSpec.allEntries.has(key)).sort();

  const report = {
    missing,
    empty,
    invalid,
    extra,
    optional,
    warning,
    warnMissing,
    warnEmpty,
    warnInvalid,
    ok: missing.length === 0 && empty.length === 0 && invalid.length === 0 && extra.length === 0
  };

  if (options.envName) {
    report.envName = options.envName;
  }

  return report;
}

function normalizeExampleSpec(exampleEntries, envName = "") {
  if (exampleEntries?.entries) {
    return buildResolvedSpec(exampleEntries.entries, envName);
  }

  if (exampleEntries?.requiredEntries && exampleEntries?.optionalEntries && exampleEntries?.warningEntries && exampleEntries?.allEntries) {
    return exampleEntries;
  }

  return {
    requiredEntries: new Map([...exampleEntries].map(([key, value]) => [key, normalizeLegacySpec(value)])),
    optionalEntries: new Map(),
    warningEntries: new Map(),
    allEntries: new Map([...exampleEntries].map(([key, value]) => [key, normalizeLegacySpec(value)]))
  };
}

function buildResolvedSpec(entries, envName = "") {
  const requiredEntries = new Map();
  const optionalEntries = new Map();
  const warningEntries = new Map();

  for (const entry of entries) {
    if (!matchesEnv(entry.envs, envName)) {
      continue;
    }

    requiredEntries.delete(entry.key);
    optionalEntries.delete(entry.key);
    warningEntries.delete(entry.key);

    const targetMap = entry.tier === "optional"
      ? optionalEntries
      : entry.tier === "warning"
        ? warningEntries
        : requiredEntries;

    targetMap.set(entry.key, {
      exampleValue: entry.exampleValue,
      rules: entry.rules,
      description: entry.description,
      envs: entry.envs
    });
  }

  return {
    requiredEntries,
    optionalEntries,
    warningEntries,
    allEntries: new Map([...requiredEntries, ...optionalEntries, ...warningEntries])
  };
}

function normalizeLegacySpec(value) {
  if (value && typeof value === "object" && "rules" in value) {
    return value;
  }

  return {
    exampleValue: typeof value === "string" ? value : "",
    rules: {}
  };
}

function splitValueAndComment(value) {
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
        return {
          value: value.slice(0, index).trimEnd(),
          comment: value.slice(index + 1).trim()
        };
      }
    }
  }

  return {
    value: value.trimEnd(),
    comment: ""
  };
}

function parseManifestDirectives(comment) {
  const normalized = comment.trim();
  const rules = {};

  if (!normalized) {
    return {
      optional: false,
      warning: false,
      rules
    };
  }

  const optional = /\boptional\b/i.test(normalized);
  const warning = /\bwarn(?:ing)?\b/i.test(normalized);
  const typeMatch = normalized.match(/\btype=(string|int|integer|number|boolean|url|json)\b/i);
  const enumMatch = normalized.match(/\benum=([^\s#]+)/i);
  const patternMatch = normalized.match(/\bpattern=([^\s#]+)/i);
  const envMatch = normalized.match(/\benv=([^\s#]+)/i);
  const description = parseDescriptionDirective(normalized);

  if (typeMatch) {
    rules.type = typeMatch[1].toLowerCase() === "integer" ? "int" : typeMatch[1].toLowerCase();
  }

  if (enumMatch) {
    rules.enum = enumMatch[1].split("|").map((item) => item.trim()).filter(Boolean);
  }

  if (patternMatch) {
    rules.pattern = patternMatch[1].trim();
  }

  const envs = envMatch
    ? envMatch[1].split(/[|,]/).map((item) => item.trim()).filter(Boolean)
    : [];

  return {
    optional,
    warning,
    rules,
    envs,
    description
  };
}

function parseDescriptionDirective(comment) {
  const quotedMatch = comment.match(/\b(?:desc|description)=(["'])(.*?)\1/i);
  if (quotedMatch) {
    return quotedMatch[2].trim();
  }

  const inlineMatch = comment.match(/\b(?:desc|description)=(.+)$/i);
  if (inlineMatch) {
    return inlineMatch[1].trim();
  }

  return "";
}

function validateValueAgainstRules(key, value, rules = {}, description = "") {
  if (!rules || Object.keys(rules).length === 0) {
    return null;
  }

  if (rules.type && !matchesType(value, rules.type)) {
    return buildValidationFailure(key, value, `type=${rules.type}`, description);
  }

  if (rules.enum && !rules.enum.includes(value)) {
    return buildValidationFailure(key, value, `enum=${rules.enum.join("|")}`, description);
  }

  if (rules.pattern) {
    try {
      const expression = new RegExp(rules.pattern);
      if (!expression.test(value)) {
        return buildValidationFailure(key, value, `pattern=${rules.pattern}`, description);
      }
    } catch {
      return buildValidationFailure(key, value, `pattern=${rules.pattern}`, description);
    }
  }

  return null;
}

function buildValidationFailure(key, value, expected, description) {
  const failure = {
    key,
    value,
    expected
  };

  if (description) {
    failure.description = description;
  }

  return failure;
}

function matchesEnv(entryEnvs = [], envName = "") {
  if (!entryEnvs || entryEnvs.length === 0) {
    return true;
  }

  if (!envName) {
    return false;
  }

  return entryEnvs.includes(envName);
}

function matchesType(value, type) {
  switch (type) {
    case "string":
      return true;
    case "int":
      return /^-?\d+$/.test(value);
    case "number":
      return value !== "" && Number.isFinite(Number(value));
    case "boolean":
      return /^(true|false|1|0|yes|no|on|off)$/i.test(value);
    case "url": {
      try {
        const parsed = new URL(value);
        return Boolean(parsed.protocol && parsed.host);
      } catch {
        return false;
      }
    }
    case "json": {
      try {
        JSON.parse(value);
        return true;
      } catch {
        return false;
      }
    }
    default:
      return true;
  }
}
