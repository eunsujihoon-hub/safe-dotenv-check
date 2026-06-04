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
  const warningEntries = new Map();

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
    const spec = {
      exampleValue: normalizeValue(value),
      rules: directives.rules
    };
    const targetMap = optional
      ? optionalEntries
      : warning
        ? warningEntries
        : requiredEntries;
    targetMap.set(key, spec);
  }

  return {
    requiredEntries,
    optionalEntries,
    warningEntries,
    allEntries: new Map([...requiredEntries, ...optionalEntries, ...warningEntries])
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

    const failure = validateValueAgainstRules(key, targetEntries.get(key), exampleSpec.requiredEntries.get(key)?.rules);
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

    const failure = validateValueAgainstRules(key, targetEntries.get(key), exampleSpec.warningEntries.get(key)?.rules);
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

    const failure = validateValueAgainstRules(key, targetEntries.get(key), exampleSpec.optionalEntries.get(key)?.rules);
    if (failure) {
      invalid.push(failure);
    }
  }

  const extra = options.allowExtra
    ? []
    : [...targetKeys].filter((key) => !exampleSpec.allEntries.has(key)).sort();

  return {
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
}

function normalizeExampleSpec(exampleEntries) {
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
  const typeMatch = normalized.match(/\btype=(string|int|number|boolean|url|json)\b/i);
  const enumMatch = normalized.match(/\benum=([^\s#]+)/i);
  const patternMatch = normalized.match(/\bpattern=([^\s#]+)/i);

  if (typeMatch) {
    rules.type = typeMatch[1].toLowerCase();
  }

  if (enumMatch) {
    rules.enum = enumMatch[1].split("|").map((item) => item.trim()).filter(Boolean);
  }

  if (patternMatch) {
    rules.pattern = patternMatch[1].trim();
  }

  return {
    optional,
    warning,
    rules
  };
}

function validateValueAgainstRules(key, value, rules = {}) {
  if (!rules || Object.keys(rules).length === 0) {
    return null;
  }

  if (rules.type && !matchesType(value, rules.type)) {
    return buildValidationFailure(key, value, `type=${rules.type}`);
  }

  if (rules.enum && !rules.enum.includes(value)) {
    return buildValidationFailure(key, value, `enum=${rules.enum.join("|")}`);
  }

  if (rules.pattern) {
    try {
      const expression = new RegExp(rules.pattern);
      if (!expression.test(value)) {
        return buildValidationFailure(key, value, `pattern=${rules.pattern}`);
      }
    } catch {
      return buildValidationFailure(key, value, `pattern=${rules.pattern}`);
    }
  }

  return null;
}

function buildValidationFailure(key, value, expected) {
  return {
    key,
    value,
    expected
  };
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
