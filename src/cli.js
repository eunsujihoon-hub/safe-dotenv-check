import fs from "node:fs";
import path from "node:path";
import {
  analyzeExampleCoverage,
  compareEnv,
  generateExampleFromEnv,
  lintExampleFile,
  loadEnvFile,
  loadExampleFile,
  syncExampleContent
} from "./check.js";

const HELP_TEXT = `safe-dotenv-check

Usage:
  safe-dotenv-check
  safe-dotenv-check --example .env.example --env .env
  safe-dotenv-check .env.production
  safe-dotenv-check --example .env.example --env .env --env .env.production
  safe-dotenv-check --example .env.example --env .env.production --env-name production
  safe-dotenv-check --example .env.example --env .env --extra warn
  safe-dotenv-check --example .env.example --env .env --format json --redact-values
  safe-dotenv-check --init --env .env.local --out .env.example
  safe-dotenv-check --sync --example .env.example --env .env.local --env .env.production
  safe-dotenv-check --sync-example --example .env.example --env .env.local
  safe-dotenv-check --doctor --example .env.example

Options:
  --example <path>      Manifest file, usually .env.example
  --env <path>          Target .env file to verify, repeatable
  --env-name <name>     Optional logical env name, once or once per --env
  --extra <mode>        Extra key mode: fail, warn, or ignore
  --allow-extra         Alias for --extra ignore
  --show-descriptions   Include manifest desc/description text in reports
  --redact-values       Omit invalid raw values from JSON reports
  --quiet               In text mode, print only failing or warning reports
  --no-suggestions      Hide next-action suggestions in text output
  --format <type>       Output format: text or json
  --init                Generate a starter .env.example from an env file
  --preset <name>       Init preset: none, nextjs, vite, or node
  --out <path>          Output path for --init, defaults to .env.example
  --force               Allow --init to overwrite an existing output file
  --sync                Compare --example coverage across one or more --env files
  --sync-example        Alias for --sync
  --write               With --sync, append missing keys to --example
  --write-missing       Alias for --sync --write
  --annotate            Add source hints to generated or synced keys
  --doctor              Lint the manifest for confusing directives
  --help                Show this message

Defaults:
  If omitted, --example defaults to .env.example and --env defaults to .env when those files exist.
  Positional arguments are treated as --env paths.
  When no --env-name is provided, names such as production are inferred from files like .env.production.

Example optional keys:
  ?SENTRY_DSN=
  REDIS_URL= # optional

Example warning-only keys:
  !SLACK_WEBHOOK_URL=
  OTEL_EXPORTER_OTLP_ENDPOINT= # warn

Example schema rules:
  PORT=3000 # type=int
  APP_URL=https://example.com # type=url
  NODE_ENV=development # enum=development|staging|production
  FEATURE_FLAGS={} # type=json optional

Example env-specific manifest lines:
  SENTRY_DSN= # env=production
  ?DEBUG_TOOLBAR= # env=dev desc="Only used for local debugging"
`;

export function runCli(argv, stdout, stderr) {
  const parsed = parseArgs(argv);

  if (parsed.help) {
    stdout.write(`${HELP_TEXT}\n`);
    return 0;
  }

  if (parsed.error) {
    stderr.write(`error: ${parsed.error}\n`);
    stderr.write("run with --help for usage\n");
    return 2;
  }

  try {
    if (parsed.init) {
      return runInit(parsed, stdout);
    }

    if (parsed.syncExample) {
      return runSyncExample(parsed, stdout);
    }

    if (parsed.doctor) {
      return runDoctor(parsed, stdout);
    }

    return runCheck(parsed, stdout);
  } catch (error) {
    stderr.write(`error: ${error.message}\n`);
    return 2;
  }
}

function runCheck(parsed, stdout) {
  const exampleEntries = loadExampleFile(parsed.examplePath);
  let allOk = true;
  const reports = [];

  for (const envPath of parsed.envPaths) {
    const envName = resolveEnvName(parsed.envNames, reports.length, envPath);
    const targetEntries = loadEnvFile(envPath);
    const result = compareEnv(exampleEntries, targetEntries, {
      extraMode: parsed.extraMode,
      envName,
      file: envPath,
      includeActions: true,
      includeDescriptions: parsed.showDescriptions,
      redactValues: parsed.redactValues
    });
    reports.push({
      file: envPath,
      ...result
    });

    if (!result.ok) {
      allOk = false;
    }
  }

  if (parsed.format === "json") {
    stdout.write(`${JSON.stringify({
      ok: allOk,
      example: parsed.examplePath,
      files: reports
    }, null, 2)}\n`);
  } else {
    for (const report of reports) {
      writeTextReport(stdout, report, parsed);
    }
  }

  return allOk ? 0 : 1;
}

function runInit(parsed, stdout) {
  const envPath = parsed.envPaths[0];
  const outputPath = parsed.outPath || ".env.example";

  if (fs.existsSync(path.resolve(outputPath)) && !parsed.force) {
    throw new Error(`output already exists: ${outputPath} (use --force to overwrite)`);
  }

  const targetEntries = loadEnvFile(envPath);
  const content = generateExampleFromEnv(targetEntries, {
    annotate: parsed.annotate,
    preset: parsed.preset,
    source: envPath
  });
  fs.writeFileSync(outputPath, content, "utf8");
  stdout.write(`created ${outputPath} from ${envPath}\n`);
  return 0;
}

function runSyncExample(parsed, stdout) {
  const exampleContent = fs.readFileSync(parsed.examplePath, "utf8");
  const targetFiles = parsed.envPaths.map((envPath) => ({
    file: envPath,
    entries: loadEnvFile(envPath)
  }));
  const targetEntries = mergeTargetEntries(targetFiles);
  const sourcesByKey = buildFirstSourceByKey(targetFiles);
  const coverage = analyzeExampleCoverage(exampleContent, targetFiles);
  const result = syncExampleContent(exampleContent, targetEntries, {
    annotate: parsed.annotate,
    sourcesByKey
  });
  const wrote = parsed.write && result.added.length > 0;

  if (wrote) {
    fs.writeFileSync(parsed.examplePath, result.content, "utf8");
  }

  if (parsed.format === "json") {
    stdout.write(`${JSON.stringify({
      ok: coverage.ok,
      example: parsed.examplePath,
      files: coverage.files,
      added: result.added,
      staleInExample: coverage.staleInExample,
      written: wrote
    }, null, 2)}\n`);
    return wrote || coverage.ok ? 0 : 1;
  }

  if (result.added.length === 0) {
    if (coverage.staleInExample.length === 0) {
      stdout.write(`${parsed.examplePath} is already in sync with ${formatEnvPathList(parsed.envPaths)}\n`);
      return 0;
    }

    stdout.write(`stale in ${parsed.examplePath}:\n`);
    for (const key of coverage.staleInExample) {
      stdout.write(`  - ${key}\n`);
    }
    return 1;
  }

  if (wrote) {
    stdout.write(`updated ${parsed.examplePath}; added ${result.added.join(", ")}\n`);
    return 0;
  }

  stdout.write(`missing from ${parsed.examplePath}:\n`);
  for (const line of result.lines) {
    stdout.write(`  + ${line}\n`);
  }
  if (coverage.staleInExample.length > 0) {
    stdout.write(`stale in ${parsed.examplePath}:\n`);
    for (const key of coverage.staleInExample) {
      stdout.write(`  - ${key}\n`);
    }
  }
  stdout.write("run again with --write to append these keys\n");
  return 1;
}

function mergeTargetEntries(targetFiles) {
  const merged = new Map();

  for (const targetFile of targetFiles) {
    for (const [key, value] of targetFile.entries) {
      if (!merged.has(key)) {
        merged.set(key, value);
      }
    }
  }

  return merged;
}

function buildFirstSourceByKey(targetFiles) {
  const sources = new Map();

  for (const targetFile of targetFiles) {
    for (const key of targetFile.entries.keys()) {
      if (!sources.has(key)) {
        sources.set(key, targetFile.file);
      }
    }
  }

  return sources;
}

function formatEnvPathList(envPaths) {
  return envPaths.length === 1 ? envPaths[0] : `${envPaths.length} env files`;
}

function runDoctor(parsed, stdout) {
  const content = fs.readFileSync(parsed.examplePath, "utf8");
  const result = lintExampleFile(content);

  if (result.findings.length === 0) {
    stdout.write(`PASS ${parsed.examplePath}\n`);
    return 0;
  }

  stdout.write(`${result.ok ? "WARN" : "FAIL"} ${parsed.examplePath}\n`);
  for (const finding of result.findings) {
    const key = finding.key ? ` ${finding.key}` : "";
    stdout.write(`  line ${finding.line}${key}: ${finding.level}: ${finding.message}\n`);
  }

  return result.ok ? 0 : 1;
}

function parseArgs(argv) {
  const envPaths = [];
  const envNames = [];
  const positionalEnvPaths = [];
  let examplePath = "";
  let extraMode = "fail";
  let format = "text";
  let force = false;
  let help = false;
  let init = false;
  let outPath = "";
  let preset = "none";
  let quiet = false;
  let redactValues = false;
  let showDescriptions = false;
  let showSuggestions = true;
  let syncExample = false;
  let doctor = false;
  let write = false;
  let annotate = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }

    if (arg === "--allow-extra") {
      extraMode = "ignore";
      continue;
    }

    if (arg === "--extra") {
      const value = readOptionValue(argv, index, arg);
      if (value.error) {
        return value;
      }
      extraMode = value.value;
      index = value.nextIndex;
      continue;
    }

    if (arg === "--show-descriptions") {
      showDescriptions = true;
      continue;
    }

    if (arg === "--redact-values") {
      redactValues = true;
      continue;
    }

    if (arg === "--quiet" || arg === "-q") {
      quiet = true;
      continue;
    }

    if (arg === "--no-suggestions") {
      showSuggestions = false;
      continue;
    }

    if (arg === "--init") {
      init = true;
      continue;
    }

    if (arg === "--sync" || arg === "--sync-example") {
      syncExample = true;
      continue;
    }

    if (arg === "--doctor" || arg === "--explain") {
      doctor = true;
      continue;
    }

    if (arg === "--write") {
      write = true;
      continue;
    }

    if (arg === "--write-missing") {
      syncExample = true;
      write = true;
      continue;
    }

    if (arg === "--annotate") {
      annotate = true;
      continue;
    }

    if (arg === "--force") {
      force = true;
      continue;
    }

    if (arg === "--format") {
      const value = readOptionValue(argv, index, arg);
      if (value.error) {
        return value;
      }
      format = value.value;
      index = value.nextIndex;
      continue;
    }

    if (arg === "--example") {
      const value = readOptionValue(argv, index, arg);
      if (value.error) {
        return value;
      }
      examplePath = value.value;
      index = value.nextIndex;
      continue;
    }

    if (arg === "--env") {
      const value = readOptionValue(argv, index, arg);
      if (value.error) {
        return value;
      }
      envPaths.push(value.value);
      index = value.nextIndex;
      continue;
    }

    if (arg === "--env-name") {
      const value = readOptionValue(argv, index, arg);
      if (value.error) {
        return value;
      }
      envNames.push(value.value);
      index = value.nextIndex;
      continue;
    }

    if (arg === "--out") {
      const value = readOptionValue(argv, index, arg);
      if (value.error) {
        return value;
      }
      outPath = value.value;
      index = value.nextIndex;
      continue;
    }

    if (arg === "--preset") {
      const value = readOptionValue(argv, index, arg);
      if (value.error) {
        return value;
      }
      preset = value.value;
      index = value.nextIndex;
      continue;
    }

    if (arg.startsWith("-")) {
      return { error: `unknown argument: ${arg}` };
    }

    positionalEnvPaths.push(arg);
  }

  if (!help) {
    if (!["text", "json"].includes(format)) {
      return { error: "--format must be either text or json" };
    }

    if (!["fail", "warn", "ignore"].includes(extraMode)) {
      return { error: "--extra must be fail, warn, or ignore" };
    }

    if (!["none", "nextjs", "vite", "node"].includes(preset)) {
      return { error: "--preset must be none, nextjs, vite, or node" };
    }

    if (!examplePath && fs.existsSync(path.resolve(".env.example"))) {
      examplePath = ".env.example";
    }

    if (envPaths.length === 0 && positionalEnvPaths.length === 0 && fs.existsSync(path.resolve(".env")) && !doctor) {
      envPaths.push(".env");
    }

    envPaths.push(...positionalEnvPaths);

    if (init) {
      if (envPaths.length !== 1) {
        return { error: "--init requires exactly one --env file" };
      }

      return validateExistingFiles({ envPaths }, {
        doctor,
        annotate,
        envNames,
        envPaths,
        examplePath,
        extraMode,
        force,
        format,
        help,
        init,
        outPath,
        preset,
        quiet,
        redactValues,
        showDescriptions,
        showSuggestions,
        syncExample,
        write
      });
    }

    if (!examplePath) {
      return { error: "--example is required (or add a local .env.example)" };
    }

    if (doctor) {
      return validateExistingFiles({ examplePath }, {
        doctor,
        annotate,
        envNames,
        envPaths,
        examplePath,
        extraMode,
        force,
        format,
        help,
        init,
        outPath,
        preset,
        quiet,
        redactValues,
        showDescriptions,
        showSuggestions,
        syncExample,
        write
      });
    }

    if (envPaths.length === 0) {
      return { error: "at least one --env is required (or add a local .env)" };
    }

    if (envNames.length > 1 && envNames.length !== envPaths.length) {
      return { error: "--env-name must be provided once or once per --env" };
    }

    return validateExistingFiles({ examplePath, envPaths }, {
      doctor,
      annotate,
      envNames,
      envPaths,
      examplePath,
      extraMode,
      force,
      format,
      help,
      init,
      outPath,
      preset,
      quiet,
      redactValues,
      showDescriptions,
      showSuggestions,
      syncExample,
      write
    });
  }

  return {
    help
  };
}

function readOptionValue(argv, index, option) {
  const value = argv[index + 1];

  if (!value || value.startsWith("-")) {
    return { error: `missing value for ${option}` };
  }

  return {
    value,
    nextIndex: index + 1
  };
}

function validateExistingFiles(paths, parsed) {
  const filePaths = [
    ...(paths.examplePath ? [paths.examplePath] : []),
    ...(paths.envPaths ?? [])
  ];

  for (const filePath of filePaths) {
    if (!filePath) {
      return { error: "missing value for --example, --env, or --out" };
    }

    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
      return { error: `file not found: ${filePath}` };
    }
  }

  return parsed;
}

function resolveEnvName(envNames, index, envPath) {
  if (envNames.length === 0) {
    return inferEnvNameFromPath(envPath);
  }

  if (envNames.length === 1) {
    return envNames[0];
  }

  return envNames[index] ?? "";
}

function inferEnvNameFromPath(envPath) {
  if (!envPath) {
    return "";
  }

  const fileName = path.basename(envPath);
  if (fileName === ".env") {
    return "";
  }

  const match = fileName.match(/^\.env\.(.+)$/);
  if (!match) {
    return "";
  }

  const suffix = match[1];
  return suffix.endsWith(".local")
    ? suffix.slice(0, -".local".length)
    : suffix;
}

function writeTextReport(stdout, report, parsed) {
  const hasWarnings = hasWarningFindings(report);

  if (parsed.quiet && report.ok && !hasWarnings) {
    return;
  }

  if (report.ok && !hasWarnings) {
    stdout.write(formatReportHeader("PASS", report));
    return;
  }

  stdout.write(formatReportHeader(report.ok ? "WARN" : "FAIL", report));
  writeList(stdout, "missing", report.missing, report.descriptions);
  writeList(stdout, "empty", report.empty, report.descriptions);
  writeInvalidList(stdout, "invalid", report.invalid, report.descriptions);
  writeList(stdout, "extra", report.extra, report.descriptions);
  writeList(stdout, "warn-extra", report.warnExtra ?? [], report.descriptions);
  if (!report.ok) {
    writeList(stdout, "optional", report.optional, report.descriptions);
    writeList(stdout, "warning", report.warning, report.descriptions);
  }
  writeList(stdout, "warn-missing", report.warnMissing, report.descriptions);
  writeList(stdout, "warn-empty", report.warnEmpty, report.descriptions);
  writeInvalidList(stdout, "warn-invalid", report.warnInvalid, report.descriptions);

  if (parsed.showSuggestions && report.actions.length > 0) {
    stdout.write("  next:\n");
    for (const action of report.actions) {
      stdout.write(`    - ${action}\n`);
    }
  }
}

function hasWarningFindings(report) {
  return (report.warnExtra ?? []).length > 0
    || report.warnMissing.length > 0
    || report.warnEmpty.length > 0
    || report.warnInvalid.length > 0;
}

function formatReportHeader(status, report) {
  return `${status} ${report.file}${report.envName ? ` (${report.envName})` : ""}\n`;
}

function writeList(stdout, label, values, descriptions = {}) {
  if (values.length > 0) {
    stdout.write(`  ${label}: ${values.map((value) => formatKey(value, descriptions)).join(", ")}\n`);
  }
}

function writeInvalidList(stdout, label, values, descriptions = {}) {
  if (values.length > 0) {
    const formatted = values.map((item) => `${formatKey(item.key, descriptions)} (${item.expected})`).join(", ");
    stdout.write(`  ${label}: ${formatted}\n`);
  }
}

function formatKey(key, descriptions = {}) {
  const description = descriptions[key];
  return description ? `${key} - ${description}` : key;
}
