import fs from "node:fs";
import path from "node:path";
import { compareEnv, loadEnvFile, loadExampleFile } from "./check.js";

const HELP_TEXT = `safe-dotenv-check

Usage:
  safe-dotenv-check
  safe-dotenv-check --example .env.example --env .env
  safe-dotenv-check .env.production
  safe-dotenv-check --example .env.example --env .env --env .env.production
  safe-dotenv-check --example .env.example --env .env.production --env-name production
  safe-dotenv-check --example .env.example --env .env --allow-extra
  safe-dotenv-check --example .env.example --env .env --format json
  safe-dotenv-check --example .env.example --env .env --show-descriptions

Options:
  --example <path>      Manifest file, usually .env.example
  --env <path>          Target .env file to verify, repeatable
  --env-name <name>     Optional logical env name, once or once per --env
  --allow-extra         Ignore keys that exist only in target files
  --show-descriptions   Include manifest desc/description text in reports
  --format <type>       Output format: text or json
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
  ?DEBUG_TOOLBAR= # env=dev desc=Only used for local debugging
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
    const exampleEntries = loadExampleFile(parsed.examplePath);
    let allOk = true;
    const reports = [];

    for (const envPath of parsed.envPaths) {
      const envName = resolveEnvName(parsed.envNames, reports.length, envPath);
      const targetEntries = loadEnvFile(envPath);
      const result = compareEnv(exampleEntries, targetEntries, {
        allowExtra: parsed.allowExtra,
        envName,
        includeDescriptions: parsed.showDescriptions
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
        const hasWarnings = report.warnMissing.length > 0 || report.warnEmpty.length > 0 || report.warnInvalid.length > 0;

        if (report.ok && !hasWarnings) {
          stdout.write(formatReportHeader("PASS", report));
          continue;
        }

        if (report.ok) {
          stdout.write(formatReportHeader("WARN", report));
          writeList(stdout, "warn-missing", report.warnMissing, report.descriptions);
          writeList(stdout, "warn-empty", report.warnEmpty, report.descriptions);
          writeInvalidList(stdout, "warn-invalid", report.warnInvalid, report.descriptions);
          continue;
        }

        stdout.write(formatReportHeader("FAIL", report));
        writeList(stdout, "missing", report.missing, report.descriptions);
        writeList(stdout, "empty", report.empty, report.descriptions);
        writeInvalidList(stdout, "invalid", report.invalid, report.descriptions);
        writeList(stdout, "extra", report.extra, report.descriptions);
        writeList(stdout, "optional", report.optional, report.descriptions);
        writeList(stdout, "warning", report.warning, report.descriptions);
        writeList(stdout, "warn-missing", report.warnMissing, report.descriptions);
        writeList(stdout, "warn-empty", report.warnEmpty, report.descriptions);
        writeInvalidList(stdout, "warn-invalid", report.warnInvalid, report.descriptions);
      }
    }

    return allOk ? 0 : 1;
  } catch (error) {
    stderr.write(`error: ${error.message}\n`);
    return 2;
  }
}

function parseArgs(argv) {
  const envPaths = [];
  const envNames = [];
  const positionalEnvPaths = [];
  let examplePath = "";
  let allowExtra = false;
  let format = "text";
  let help = false;
  let showDescriptions = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }

    if (arg === "--allow-extra") {
      allowExtra = true;
      continue;
    }

    if (arg === "--show-descriptions") {
      showDescriptions = true;
      continue;
    }

    if (arg === "--format") {
      format = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (arg === "--example") {
      examplePath = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (arg === "--env") {
      const envPath = argv[index + 1] ?? "";
      envPaths.push(envPath);
      index += 1;
      continue;
    }

    if (arg === "--env-name") {
      const envName = argv[index + 1] ?? "";
      envNames.push(envName);
      index += 1;
      continue;
    }

    if (arg.startsWith("-")) {
      return { error: `unknown argument: ${arg}` };
    }

    positionalEnvPaths.push(arg);
  }

  if (!help) {
    if (!examplePath && fs.existsSync(path.resolve(".env.example"))) {
      examplePath = ".env.example";
    }

    if (envPaths.length === 0 && positionalEnvPaths.length === 0 && fs.existsSync(path.resolve(".env"))) {
      envPaths.push(".env");
    }

    envPaths.push(...positionalEnvPaths);

    if (!examplePath) {
      return { error: "--example is required (or add a local .env.example)" };
    }

    if (envPaths.length === 0) {
      return { error: "at least one --env is required (or add a local .env)" };
    }

    if (!["text", "json"].includes(format)) {
      return { error: "--format must be either text or json" };
    }

    if (envNames.length > 1 && envNames.length !== envPaths.length) {
      return { error: "--env-name must be provided once or once per --env" };
    }

    const filePaths = [examplePath, ...envPaths];
    for (const filePath of filePaths) {
      if (!filePath) {
        return { error: "missing value for --example or --env" };
      }

      const resolvedPath = path.resolve(filePath);
      if (!fs.existsSync(resolvedPath)) {
        return { error: `file not found: ${filePath}` };
      }
    }
  }

  return {
    allowExtra,
    envPaths,
    envNames,
    examplePath,
    format,
    help,
    showDescriptions
  };
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
