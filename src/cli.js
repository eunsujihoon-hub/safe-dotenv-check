import fs from "node:fs";
import path from "node:path";
import { compareEnv, loadEnvFile, loadExampleFile } from "./check.js";

const HELP_TEXT = `safe-dotenv-check

Usage:
  safe-dotenv-check --example .env.example --env .env
  safe-dotenv-check --example .env.example --env .env --env .env.production
  safe-dotenv-check --example .env.example --env .env.production --env-name production
  safe-dotenv-check --example .env.example --env .env --allow-extra
  safe-dotenv-check --example .env.example --env .env --format json

Options:
  --example <path>    Required manifest file, usually .env.example
  --env <path>        Target .env file to verify, repeatable
  --env-name <name>   Optional logical env name, once or once per --env
  --allow-extra       Ignore keys that exist only in target files
  --format <type>     Output format: text or json
  --help              Show this message

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
      const envName = resolveEnvName(parsed.envNames, reports.length);
      const targetEntries = loadEnvFile(envPath);
      const result = compareEnv(exampleEntries, targetEntries, {
        allowExtra: parsed.allowExtra,
        envName
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
          writeList(stdout, "warn-missing", report.warnMissing);
          writeList(stdout, "warn-empty", report.warnEmpty);
          writeInvalidList(stdout, "warn-invalid", report.warnInvalid);
          continue;
        }

        stdout.write(formatReportHeader("FAIL", report));
        writeList(stdout, "missing", report.missing);
        writeList(stdout, "empty", report.empty);
        writeInvalidList(stdout, "invalid", report.invalid);
        writeList(stdout, "extra", report.extra);
        writeList(stdout, "optional", report.optional);
        writeList(stdout, "warning", report.warning);
        writeList(stdout, "warn-missing", report.warnMissing);
        writeList(stdout, "warn-empty", report.warnEmpty);
        writeInvalidList(stdout, "warn-invalid", report.warnInvalid);
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
  let examplePath = "";
  let allowExtra = false;
  let format = "text";
  let help = false;

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

    return { error: `unknown argument: ${arg}` };
  }

  if (!help) {
    if (!examplePath) {
      return { error: "--example is required" };
    }

    if (envPaths.length === 0) {
      return { error: "at least one --env is required" };
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
    help
  };
}

function resolveEnvName(envNames, index) {
  if (envNames.length === 0) {
    return "";
  }

  if (envNames.length === 1) {
    return envNames[0];
  }

  return envNames[index] ?? "";
}

function formatReportHeader(status, report) {
  return `${status} ${report.file}${report.envName ? ` (${report.envName})` : ""}\n`;
}

function writeList(stdout, label, values) {
  if (values.length > 0) {
    stdout.write(`  ${label}: ${values.join(", ")}\n`);
  }
}

function writeInvalidList(stdout, label, values) {
  if (values.length > 0) {
    const formatted = values.map((item) => `${item.key} (${item.expected})`).join(", ");
    stdout.write(`  ${label}: ${formatted}\n`);
  }
}
