import fs from "node:fs";
import path from "node:path";
import { compareEnv, loadEnvFile } from "./check.js";

const HELP_TEXT = `safe-dotenv-check

Usage:
  safe-dotenv-check --example .env.example --env .env
  safe-dotenv-check --example .env.example --env .env --env .env.production
  safe-dotenv-check --example .env.example --env .env --allow-extra

Options:
  --example <path>    Required manifest file, usually .env.example
  --env <path>        Target .env file to verify, repeatable
  --allow-extra       Ignore keys that exist only in target files
  --help              Show this message
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
    const exampleEntries = loadEnvFile(parsed.examplePath);
    let allOk = true;

    for (const envPath of parsed.envPaths) {
      const targetEntries = loadEnvFile(envPath);
      const result = compareEnv(exampleEntries, targetEntries, {
        allowExtra: parsed.allowExtra
      });

      if (result.ok) {
        stdout.write(`PASS ${envPath}\n`);
        continue;
      }

      allOk = false;
      stdout.write(`FAIL ${envPath}\n`);
      writeList(stdout, "missing", result.missing);
      writeList(stdout, "empty", result.empty);
      writeList(stdout, "extra", result.extra);
    }

    return allOk ? 0 : 1;
  } catch (error) {
    stderr.write(`error: ${error.message}\n`);
    return 2;
  }
}

function parseArgs(argv) {
  const envPaths = [];
  let examplePath = "";
  let allowExtra = false;
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

    return { error: `unknown argument: ${arg}` };
  }

  if (!help) {
    if (!examplePath) {
      return { error: "--example is required" };
    }

    if (envPaths.length === 0) {
      return { error: "at least one --env is required" };
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
    examplePath,
    help
  };
}

function writeList(stdout, label, values) {
  if (values.length > 0) {
    stdout.write(`  ${label}: ${values.join(", ")}\n`);
  }
}
