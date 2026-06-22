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

export function generateExampleFromEnv(targetEntries, options = {}) {
  const presetEntries = getPresetEntries(options.preset);
  const keys = new Set([...presetEntries.map((entry) => entry.key), ...targetEntries.keys()]);
  const presetByKey = new Map(presetEntries.map((entry) => [entry.key, entry]));

  return [...keys]
    .sort()
    .map((key) => formatExampleLine(key, {
      annotate: options.annotate,
      source: options.source,
      value: targetEntries.get(key) ?? "",
      ...presetByKey.get(key)
    }))
    .join("\n") + "\n";
}

export function syncExampleContent(exampleContent, targetEntries, options = {}) {
  const example = parseExampleFile(exampleContent);
  const existingKeys = new Set(example.entries.map((entry) => entry.key));
  const missingKeys = [...targetEntries.keys()]
    .filter((key) => !existingKeys.has(key))
    .sort();
  const missingLines = missingKeys.map((key) => formatExampleLine(key, {
    annotate: options.annotate,
    source: options.source,
    value: targetEntries.get(key) ?? ""
  }));

  if (missingKeys.length === 0) {
    return {
      added: [],
      lines: [],
      content: exampleContent
    };
  }

  const suffix = exampleContent.endsWith("\n") ? "" : "\n";
  return {
    added: missingKeys,
    lines: missingLines,
    content: `${exampleContent}${suffix}${missingLines.join("\n")}\n`
  };
}

export function lintExampleFile(content) {
  const findings = [];
  const seenKeys = new Map();

  for (const [lineIndex, rawLine] of content.split(/\r?\n/).entries()) {
    const lineNumber = lineIndex + 1;
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const withoutExport = line.startsWith("export ") ? line.slice(7) : line;
    const normalizedLine = withoutExport
      .replace(/^\?/, "")
      .replace(/^!/, "");
    const separatorIndex = normalizedLine.indexOf("=");
    const key = separatorIndex === -1
      ? normalizedLine.trim()
      : normalizedLine.slice(0, separatorIndex).trim();

    if (!key) {
      findings.push({
        line: lineNumber,
        level: "warning",
        message: "empty key is ignored"
      });
      continue;
    }

    const rawValue = separatorIndex === -1 ? "" : normalizedLine.slice(separatorIndex + 1).trim();
    const { comment } = splitValueAndComment(rawValue);
    const tokens = tokenizeDirectiveComment(comment);
    const envs = getEnvDirectiveValues(tokens);
    const duplicate = findOverlappingEntry(seenKeys.get(key) ?? [], envs);

    if (duplicate) {
      findings.push({
        line: lineNumber,
        key,
        level: "warning",
        message: `duplicate key overlaps with line ${duplicate.line}; later entry wins`
      });
    }

    seenKeys.set(key, [...(seenKeys.get(key) ?? []), { line: lineNumber, envs }]);

    for (const token of tokens) {
      if (/^type=/i.test(token) && !/^type=(string|int|integer|number|boolean|url|json)$/i.test(token)) {
        findings.push({
          line: lineNumber,
          key,
          level: "warning",
          message: `unknown type directive: ${token}`
        });
      }

      if (/^pattern=/i.test(token)) {
        const pattern = token.replace(/^pattern=/i, "");
        try {
          new RegExp(pattern);
        } catch {
          findings.push({
            line: lineNumber,
            key,
            level: "error",
            message: `invalid regex pattern: ${pattern}`
          });
        }
      }

      if (/^enum=/i.test(token)) {
        const values = token.replace(/^enum=/i, "").split("|").map((item) => item.trim()).filter(Boolean);
        if (values.length === 0) {
          findings.push({
            line: lineNumber,
            key,
            level: "warning",
            message: "enum directive has no values"
          });
        }
      }
    }

    const descriptionToken = tokens.find((token) => /^(?:desc|description)=/i.test(token));
    if (descriptionToken && !/^(?:desc|description)=["'].*["']$/i.test(descriptionToken)) {
      const descriptionIndex = tokens.indexOf(descriptionToken);
      if (tokens.slice(descriptionIndex + 1).some(isKnownDirectiveToken)) {
        findings.push({
          line: lineNumber,
          key,
          level: "warning",
          message: "quote desc/description when another directive follows it"
        });
      }
    }
  }

  return {
    ok: findings.every((finding) => finding.level !== "error"),
    findings
  };
}

function getEnvDirectiveValues(tokens) {
  const envToken = tokens.find((token) => /^env=/i.test(token));
  if (!envToken) {
    return [];
  }

  return envToken
    .replace(/^env=/i, "")
    .split(/[|,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function findOverlappingEntry(entries, envs) {
  return entries.find((entry) => envScopesOverlap(entry.envs, envs));
}

function envScopesOverlap(left = [], right = []) {
  if (left.length === 0 || right.length === 0) {
    return true;
  }

  return left.some((item) => right.includes(item));
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
  const extraMode = options.extraMode ?? (options.allowExtra ? "ignore" : "fail");

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
      exampleSpec.requiredEntries.get(key)?.description,
      options.redactValues
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
      exampleSpec.warningEntries.get(key)?.description,
      options.redactValues
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
      exampleSpec.optionalEntries.get(key)?.description,
      options.redactValues
    );
    if (failure) {
      invalid.push(failure);
    }
  }

  const discoveredExtra = [...targetKeys].filter((key) => !exampleSpec.allEntries.has(key)).sort();
  const extra = extraMode === "fail" ? discoveredExtra : [];
  const warnExtra = extraMode === "warn" ? discoveredExtra : [];

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

  if (options.file) {
    report.file = options.file;
  }

  if (extraMode === "warn") {
    report.warnExtra = warnExtra;
  }

  if (options.includeActions) {
    report.actions = buildActions(report);
  }

  if (options.includeDescriptions) {
    report.descriptions = buildDescriptions(exampleSpec.allEntries);
  }

  if (options.envName) {
    report.envName = options.envName;
  }

  return report;
}

function buildActions(report) {
  return [
    ...report.missing.map((key) => `add ${key} to ${report.file ?? "the target env file"}`),
    ...report.empty.map((key) => `set a non-empty value for ${key}`),
    ...report.invalid.map((item) => `update ${item.key} to match ${item.expected}`),
    ...report.extra.map((key) => `remove ${key} from the target env file, add it to the manifest, or use --extra warn/ignore`),
    ...(report.warnExtra ?? []).map((key) => `review extra key ${key}; add it to the manifest if it is intentional`),
    ...report.warnMissing.map((key) => `optionally add warning-only key ${key}`),
    ...report.warnEmpty.map((key) => `optionally set warning-only key ${key}`),
    ...report.warnInvalid.map((item) => `optionally update ${item.key} to match ${item.expected}`)
  ];
}

function buildDescriptions(entries) {
  return Object.fromEntries(
    [...entries]
      .filter(([, entry]) => entry.description)
      .map(([key, entry]) => [key, entry.description])
  );
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

  const tokens = tokenizeDirectiveComment(normalized);
  const description = parseDescriptionFromTokens(tokens);
  const directiveTokens = tokens.filter((token) => !/^(?:desc|description)=/i.test(token));
  const optional = directiveTokens.some((token) => /^optional$/i.test(token));
  const warning = directiveTokens.some((token) => /^warn(?:ing)?$/i.test(token));
  const typeToken = directiveTokens.find((token) => /^type=/i.test(token));
  const enumToken = directiveTokens.find((token) => /^enum=/i.test(token));
  const patternToken = directiveTokens.find((token) => /^pattern=/i.test(token));
  const envToken = directiveTokens.find((token) => /^env=/i.test(token));
  const typeMatch = typeToken?.match(/^type=(string|int|integer|number|boolean|url|json)$/i);
  const enumMatch = enumToken?.match(/^enum=(.+)$/i);
  const patternMatch = patternToken?.match(/^pattern=(.+)$/i);
  const envMatch = envToken?.match(/^env=(.+)$/i);

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

function tokenizeDirectiveComment(comment) {
  const tokens = [];
  let current = "";
  let quote = "";
  let escaped = false;

  for (const char of comment) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      current += char;
      escaped = true;
      continue;
    }

    if (quote) {
      current += char;
      if (char === quote) {
        quote = "";
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      current += char;
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

function parseDescriptionFromTokens(tokens) {
  const descriptionIndex = tokens.findIndex((token) => /^(?:desc|description)=/i.test(token));
  if (descriptionIndex === -1) {
    return "";
  }

  const token = tokens[descriptionIndex];
  const rawValue = token.replace(/^(?:desc|description)=/i, "");
  const remainder = tokens
    .slice(descriptionIndex + 1)
    .filter((item) => !isKnownDirectiveToken(item));
  return normalizeDescriptionValue([rawValue, ...remainder].join(" ").trim());
}

function isKnownDirectiveToken(token) {
  return /^(?:optional|warn(?:ing)?|type=|enum=|pattern=|env=)/i.test(token);
}

function normalizeDescriptionValue(value) {
  if (!value) {
    return "";
  }

  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1).trim();
  }

  return value.trim();
}

function validateValueAgainstRules(key, value, rules = {}, description = "", redactValue = false) {
  if (!rules || Object.keys(rules).length === 0) {
    return null;
  }

  if (rules.type && !matchesType(value, rules.type)) {
    return buildValidationFailure(key, value, `type=${rules.type}`, description, redactValue);
  }

  if (rules.enum && !rules.enum.includes(value)) {
    return buildValidationFailure(key, value, `enum=${rules.enum.join("|")}`, description, redactValue);
  }

  if (rules.pattern) {
    try {
      const expression = new RegExp(rules.pattern);
      if (!expression.test(value)) {
        return buildValidationFailure(key, value, `pattern=${rules.pattern}`, description, redactValue);
      }
    } catch {
      return buildValidationFailure(key, value, `pattern=${rules.pattern}`, description, redactValue);
    }
  }

  return null;
}

function buildValidationFailure(key, value, expected, description, redactValue = false) {
  const failure = {
    key,
    expected
  };

  if (!redactValue) {
    failure.value = value;
  }

  if (description) {
    failure.description = description;
  }

  return failure;
}

function getPresetEntries(preset = "") {
  switch (preset) {
    case "":
    case "none":
      return [];
    case "nextjs":
      return [
        { key: "DATABASE_URL", rules: { type: "url" }, description: "Primary database connection" },
        { key: "NEXT_PUBLIC_APP_URL", rules: { type: "url" }, description: "Browser-exposed app URL" },
        { key: "NEXT_PUBLIC_API_BASE_URL", rules: { type: "url" }, description: "Browser-exposed API base URL" },
        { key: "NODE_ENV", rules: { enum: ["development", "test", "production"] } }
      ];
    case "vite":
      return [
        { key: "VITE_API_BASE_URL", rules: { type: "url" }, description: "Browser-exposed API base URL" },
        { key: "NODE_ENV", rules: { enum: ["development", "test", "production"] } }
      ];
    case "node":
      return [
        { key: "DATABASE_URL", rules: { type: "url" }, description: "Primary database connection" },
        { key: "NODE_ENV", rules: { enum: ["development", "test", "production"] } },
        { key: "PORT", rules: { type: "int" } }
      ];
    default:
      return [];
  }
}

function formatExampleLine(key, options = {}) {
  const keyRules = inferRulesFromKey(key);
  const explicitRules = options.rules ?? {};
  const valueRules = Object.keys(keyRules).length > 0 || Object.keys(explicitRules).length > 0
    ? {}
    : inferRulesFromValue(key, options.value ?? "");
  const rules = {
    ...valueRules,
    ...keyRules,
    ...explicitRules
  };
  const directives = [
    ...formatRuleDirectives(rules),
    ...(options.description ? [`desc="${escapeDescription(options.description)}"`] : []),
    ...(options.annotate ? [`added-by=safe-dotenv-check`, ...(options.source ? [`source=${formatDirectiveValue(options.source)}`] : [])] : [])
  ];

  return directives.length > 0
    ? `${key}= # ${directives.join(" ")}`
    : `${key}=`;
}

function inferRulesFromKey(key) {
  if (key === "NODE_ENV") {
    return { enum: ["development", "test", "production"] };
  }

  if (key === "PORT" || key.endsWith("_PORT")) {
    return { type: "int" };
  }

  if (key === "URL" || key.endsWith("_URL") || key.endsWith("_URI")) {
    return { type: "url" };
  }

  return {};
}

function inferRulesFromValue(key, value) {
  if (!value) {
    return {};
  }

  if (isSensitiveKey(key)) {
    return {};
  }

  if (matchesType(value, "int")) {
    return { type: "int" };
  }

  if (matchesType(value, "number")) {
    return { type: "number" };
  }

  if (matchesType(value, "boolean")) {
    return { type: "boolean" };
  }

  if (matchesType(value, "url")) {
    return { type: "url" };
  }

  if ((value.startsWith("{") || value.startsWith("[")) && matchesType(value, "json")) {
    return { type: "json" };
  }

  return {};
}

function formatRuleDirectives(rules = {}) {
  return [
    ...(rules.type ? [`type=${rules.type}`] : []),
    ...(rules.enum ? [`enum=${rules.enum.join("|")}`] : []),
    ...(rules.pattern ? [`pattern=${rules.pattern}`] : [])
  ];
}

function escapeDescription(value) {
  return value.replace(/"/g, "\\\"");
}

function formatDirectiveValue(value) {
  if (/^[^\s"'\\]+$/.test(value)) {
    return value;
  }

  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}

function isSensitiveKey(key) {
  return /(^|_)(?:API_)?(?:KEY|TOKEN|SECRET|PASSWORD|PASS|PRIVATE|CREDENTIAL|CREDENTIALS)(?:_|$)/i.test(key);
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
