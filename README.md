# safe-dotenv-check

[![CI](https://github.com/eunsujihoon-hub/safe-dotenv-check/actions/workflows/ci.yml/badge.svg)](https://github.com/eunsujihoon-hub/safe-dotenv-check/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

A contract-first CLI to compare environment keys from a manifest file such as `.env.example` against one or more target `.env` files.

It focuses on the checks that usually matter during deploys:

- required keys that must exist
- optional keys that are documented but not enforced
- warning-only keys that should exist but should not block deploys
- empty values for required keys
- schema validation for typed values such as integers, URLs, booleans, JSON, enums, and regex patterns
- unexpected extra keys
- machine-readable JSON output for CI or deployment checks
- a reusable GitHub Action wrapper for repository-level checks

This turns a loose `.env.example` file into a lightweight env contract for local development, CI, and deployment workflows.

## Install

```bash
npm install --global safe-dotenv-check
```

Or run it without installing:

```bash
npx safe-dotenv-check --example .env.example --env .env
```

## GitHub Action

Use the repository directly in GitHub Actions:

```yaml
jobs:
  env-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: eunsujihoon-hub/safe-dotenv-check@v1.0.0
        with:
          example: .env.example
          env_files: |
            .env.ci
            .env.production
```

Available inputs:

- `example`: manifest path such as `.env.example`
- `env_files`: newline-separated target env file paths
- `allow_extra`: set to `true` to ignore keys that exist only in target files
- `summary`: set to `false` to skip step summary output
- `json_output_path`: optional path where the JSON report should be copied

## Usage

```bash
safe-dotenv-check --example .env.example --env .env
safe-dotenv-check --example .env.example --env .env --env .env.production
safe-dotenv-check --example .env.example --env .env --allow-extra
safe-dotenv-check --example .env.example --env .env --format json
```

## Exit codes

- `0`: all files passed
- `1`: at least one file has missing or empty required keys, or unexpected extra keys when `--allow-extra` is not set
- `2`: invalid CLI usage or unreadable files

## Manifest tiers

The manifest supports three levels:

- required: must exist and must not be empty
- optional: documented only, never fails validation
- warning-only: reported when missing or empty, but does not change the exit code

Example:

```dotenv
# .env.example
DATABASE_URL=
OPENAI_API_KEY=
LOG_LEVEL=info
?SENTRY_DSN=
REDIS_URL= # optional
!SLACK_WEBHOOK_URL=
OTEL_EXPORTER_OTLP_ENDPOINT= # warn
```

Optional keys can be marked in either of these forms:

```dotenv
?SENTRY_DSN=
REDIS_URL= # optional
```

Warning-only keys can be marked in either of these forms:

```dotenv
!SLACK_WEBHOOK_URL=
OTEL_EXPORTER_OTLP_ENDPOINT= # warn
```

Inline comments after an unquoted value are ignored, so `API_KEY= # comment` is treated as empty.

## Schema rules

You can attach schema directives in the inline comment area of each manifest entry:

```dotenv
PORT=3000 # type=int
APP_URL=https://example.com # type=url
NODE_ENV=development # enum=development|staging|production
FEATURE_FLAGS={} # type=json optional
API_KEY= # pattern=^sk-[a-z0-9]+$
```

Supported directives:

- `type=string`
- `type=int`
- `type=number`
- `type=boolean`
- `type=url`
- `type=json`
- `enum=value1|value2|value3`
- `pattern=<regex>`

Rule behavior:

- missing required keys still fail before schema validation
- empty required keys still fail as empty values
- optional keys are validated only when present and non-empty
- warning-only keys report invalid values as warnings instead of failures
- `type`, `enum`, and `pattern` can be combined on the same key

Example:

```dotenv
DATABASE_URL=postgres://localhost/app # type=url
PORT=3000 # type=int
NODE_ENV=development # enum=development|test|production
FEATURE_FLAGS={"beta":false} # type=json optional
!OTEL_EXPORTER_OTLP_ENDPOINT=https://otel.example.com # type=url
```

## Output example

```text
PASS .env
FAIL .env.production
  missing: OPENAI_API_KEY
  empty: DATABASE_URL
  invalid: PORT (type=int), NODE_ENV (enum=development|staging|production)
  extra: DEBUG
WARN .env.staging
  warn-missing: SLACK_WEBHOOK_URL
  warn-empty: OTEL_EXPORTER_OTLP_ENDPOINT
  warn-invalid: OTEL_EXPORTER_OTLP_ENDPOINT (type=url)
```

## JSON output

```bash
safe-dotenv-check --example .env.example --env .env --format json
```

```json
{
  "ok": false,
  "example": ".env.example",
  "files": [
    {
      "file": ".env",
      "missing": [
        "OPENAI_API_KEY"
      ],
      "empty": [
        "DATABASE_URL"
      ],
      "invalid": [
        {
          "key": "PORT",
          "value": "abc",
          "expected": "type=int"
        }
      ],
      "extra": [],
      "optional": [],
      "warning": [
        "SLACK_WEBHOOK_URL"
      ],
      "warnMissing": [
        "SLACK_WEBHOOK_URL"
      ],
      "warnEmpty": [],
      "warnInvalid": [],
      "ok": false
    }
  ]
}
```

## Why this exists

Many teams keep `.env.example` around but do not actually verify deploy-time env files against it, or they need more nuance than just pass or fail. This tool is intentionally small enough to drop into CI, pre-deploy scripts, or local sanity checks while still letting one manifest describe hard requirements, optional keys, recommended integrations, and typed value expectations.

## Secret safety

This repository ignores common secret-bearing files by default:

- `.env`
- `.env.local`
- `.env.production.local`
- `.envrc`
- `secrets/`
- certificate and private key files such as `*.pem` and `*.key`

Commit only redacted examples such as `.env.example`. Do not commit real credentials just because the tool checks them.

## Roadmap

- multi-environment contract files for `dev`, `staging`, and `prod`
- platform adapters for GitHub Actions secrets and hosted deploy platforms
- generated env reference docs from the manifest

## Contributing

Bug reports and pull requests are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Development

```bash
npm test
npm run pack:check
```
