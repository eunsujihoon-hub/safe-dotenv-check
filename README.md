# safe-dotenv-check

[![CI](https://github.com/eunsujihoon-hub/safe-dotenv-check/actions/workflows/ci.yml/badge.svg)](https://github.com/eunsujihoon-hub/safe-dotenv-check/actions/workflows/ci.yml)
[![CodeQL](https://github.com/eunsujihoon-hub/safe-dotenv-check/actions/workflows/codeql.yml/badge.svg)](https://github.com/eunsujihoon-hub/safe-dotenv-check/actions/workflows/codeql.yml)
[![npm version](https://img.shields.io/npm/v/safe-dotenv-check.svg)](https://www.npmjs.com/package/safe-dotenv-check)
[![npm downloads](https://img.shields.io/npm/dm/safe-dotenv-check.svg)](https://www.npmjs.com/package/safe-dotenv-check)
[![Node >=18](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](./package.json)
[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

Stop treating `.env.example` like decoration. Turn it into a tiny contract that catches missing, empty, misshaped, and drifting env values before CI or deploy breaks.

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

## Why Use It

- `.env.example` already exists in many repos, but it rarely proves the real env is usable.
- Deploy failures from one missing key or blank value are boring, avoidable, and expensive.
- Runtime config libraries are useful, but CI still needs a simple preflight check.
- Real projects need nuance: required keys, optional docs, warning-only integrations, and production-only rules.

`safe-dotenv-check` stays small: one CLI, one manifest file, plain text for humans, JSON for CI.

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
      - uses: eunsujihoon-hub/safe-dotenv-check@v1.4.1
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

Generate a redacted starter manifest from an existing local env file:

```bash
safe-dotenv-check --init --env .env.local --out .env.example
safe-dotenv-check --init --env .env.local --out .env.example --preset nextjs
```

Find keys that exist in a target env file but are missing from the manifest:

```bash
safe-dotenv-check --sync-example --example .env.example --env .env.local
safe-dotenv-check --sync-example --example .env.example --env .env.local --write
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
