# safe-dotenv-check

[![CI](https://github.com/eunsujihoon-hub/safe-dotenv-check/actions/workflows/ci.yml/badge.svg)](https://github.com/eunsujihoon-hub/safe-dotenv-check/actions/workflows/ci.yml)
[![CodeQL](https://github.com/eunsujihoon-hub/safe-dotenv-check/actions/workflows/codeql.yml/badge.svg)](https://github.com/eunsujihoon-hub/safe-dotenv-check/actions/workflows/codeql.yml)
[![npm version](https://img.shields.io/npm/v/safe-dotenv-check.svg)](https://www.npmjs.com/package/safe-dotenv-check)
[![npm downloads](https://img.shields.io/npm/dm/safe-dotenv-check.svg)](https://www.npmjs.com/package/safe-dotenv-check)
[![Node >=18](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](./package.json)
[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

Your deploy should not be a coin toss because one env var was blank.

`safe-dotenv-check` turns `.env.example` into a tiny contract: required keys, optional docs, warning-only integrations, type checks, env-specific rules, and CI output that tells you exactly what to fix.

```bash
npx safe-dotenv-check --example .env.example --env .env.production --env-name production
```

```text
FAIL .env.production (production)
  missing: OPENAI_API_KEY
  invalid: DATABASE_URL (type=url), NODE_ENV (enum=development|staging|production)
  next:
    - add OPENAI_API_KEY to .env.production
    - update DATABASE_URL to match type=url
```

## Why Teams Use It

- `.env.example` stops being a stale checklist and starts blocking broken config.
- One missing key, blank value, or bad URL fails before deploy.
- Optional docs and warning-only integrations keep adoption practical.
- JSON output and GitHub summaries make it useful in CI, not just locally.

Bootstrap the contract from a real env file, with common schema hints inferred:

```bash
npx safe-dotenv-check --init --env .env.local --out .env.example --preset nextjs
```

```dotenv
DATABASE_URL= # type=url desc="Primary database connection"
NEXT_PUBLIC_APP_URL= # type=url desc="Browser-exposed app URL"
NODE_ENV= # enum=development|test|production
PORT= # type=int
```

## What It Checks

- required keys that are missing or empty
- optional keys that should be documented but not enforced
- warning-only keys that should be reported without failing deploys
- extra keys in target env files: fail, warn, or ignore
- value shape with `type=`, `enum=`, and `pattern=`
- env-specific contracts such as `env=production`
- manifest mistakes and overlapping duplicate keys with `--doctor`

## Install

```bash
npm install --global safe-dotenv-check
```

Or run without installing:

```bash
npx safe-dotenv-check
npx safe-dotenv-check .env.production
npx safe-dotenv-check --example .env.example --env .env --format json
```

By default, the CLI uses `.env.example` and `.env` when both exist. Positional arguments are treated as target env files.

## Manifest

Use `.env.example` as the contract:

```dotenv
DATABASE_URL= # type=url desc="Primary database"
OPENAI_API_KEY=
NODE_ENV=development # enum=development|staging|production
PORT=3000 # type=int
?SENTRY_DSN=
!SLACK_WEBHOOK_URL=
FEATURE_FLAGS={} # type=json optional
API_KEY= # pattern=^sk-[a-z0-9]+$
```

Tiers:

- `KEY=` means required: missing, empty, or invalid values fail.
- `?KEY=` or `# optional` means documented only.
- `!KEY=` or `# warn` means report problems without changing the exit code.

Environment-specific rules:

```dotenv
?SENTRY_DSN= # env=dev desc="Local error tracking only"
SENTRY_DSN= # env=production desc="Production error tracking DSN"
!SLACK_WEBHOOK_URL= # env=staging,production desc="Deploy notifications"
```

```bash
safe-dotenv-check --example .env.example --env .env.production --env-name production
```

Supported schema directives:

- `type=string`
- `type=int` or `type=integer`
- `type=number`
- `type=boolean`
- `type=url`
- `type=json`
- `enum=value1|value2|value3`
- `pattern=<regex>`

## CLI

Common commands:

```bash
safe-dotenv-check
safe-dotenv-check .env.production
safe-dotenv-check --example .env.example --env .env --env .env.production
safe-dotenv-check --example .env.example --env .env.production --env-name production
safe-dotenv-check --example .env.example --env .env --extra warn
safe-dotenv-check --example .env.example --env .env --format json --redact-values
safe-dotenv-check --example .env.example --env .env --quiet
safe-dotenv-check --doctor --example .env.example
```

Exit codes:

- `0`: all enforced checks passed
- `1`: at least one target file failed
- `2`: invalid CLI usage or unreadable files

Output options:

- `--format text|json`: choose human or machine output
- `--redact-values`: omit invalid raw values from JSON reports
- `--show-descriptions`: include `desc=` text in reports
- `--quiet`: in text mode, print only failing or warning reports
- `--no-suggestions`: hide next-action hints
- `--write-missing`: alias for `--sync-example --write`
- `--annotate`: add source hints to generated or synced keys

Extra key modes:

```bash
safe-dotenv-check --example .env.example --env .env.production --extra fail
safe-dotenv-check --example .env.example --env .env.production --extra warn
safe-dotenv-check --example .env.example --env .env.production --extra ignore
```

## GitHub Action

```yaml
jobs:
  env-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: eunsujihoon-hub/safe-dotenv-check@v1.5.0
        with:
          example: .env.example
          env_files: |
            .env.ci
            .env.production
          env_names: |
            ci
            production
          extra: warn
```

Action inputs:

- `example`: manifest path
- `env_files`: newline-separated target env file paths
- `env_names`: optional newline-separated logical env names
- `extra`: `fail`, `warn`, or `ignore`
- `allow_extra`: legacy alias for `extra: ignore`
- `show_descriptions`: include manifest descriptions in reports
- `redact_values`: omit invalid raw values from JSON reports, defaults to `true`
- `summary`: write a GitHub step summary, defaults to `true`
- `json_output_path`: copy the JSON report to a chosen path

See [docs/github-actions.md](./docs/github-actions.md) for a fuller setup.

## Starter Helpers

Generate a redacted starter manifest from an existing local env file. Common schema directives are inferred from key names and values:

```bash
safe-dotenv-check --init --env .env.local --out .env.example
safe-dotenv-check --init --env .env.local --out .env.example --preset nextjs
safe-dotenv-check --init --env .env.local --out .env.example --preset node --annotate
```

Find keys that exist in a target env file but are missing from the manifest:

```bash
safe-dotenv-check --sync-example --example .env.example --env .env.local
safe-dotenv-check --sync-example --example .env.example --env .env.local --write
safe-dotenv-check --write-missing --annotate --example .env.example --env .env.local
```

## Examples

- [examples/nextjs](./examples/nextjs)
- [examples/github-action](./examples/github-action)
- [examples/monorepo](./examples/monorepo)

## Secret Safety

Commit redacted examples such as `.env.example`, not real secrets. This repo ignores common secret-bearing files including `.env`, `.env.local`, `.env.production.local`, `.envrc`, `secrets/`, `*.pem`, and `*.key`.

## Development

```bash
npm test
npm run pack:check
```

Bug reports and pull requests are welcome. If you hit a real env mismatch this tool should catch better, open an issue with the shape of the manifest and target env file.
