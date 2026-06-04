# safe-dotenv-check

[![CI](https://github.com/eunsujihoon-hub/safe-dotenv-check/actions/workflows/ci.yml/badge.svg)](https://github.com/eunsujihoon-hub/safe-dotenv-check/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

Small CLI to compare environment keys from a manifest file such as `.env.example` against one or more target `.env` files.

It focuses on the checks that usually matter during deploys:

- required keys that must exist
- optional keys that are documented but not enforced
- warning-only keys that should exist but should not block deploys
- empty values for required keys
- unexpected extra keys
- machine-readable JSON output for CI or deployment checks
- a reusable GitHub Action wrapper for repository-level checks

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
      - uses: eunsujihoon-hub/safe-dotenv-check@v0.2.2
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

## Output example

```text
PASS .env
FAIL .env.production
  missing: OPENAI_API_KEY
  empty: DATABASE_URL
  extra: DEBUG
WARN .env.staging
  warn-missing: SLACK_WEBHOOK_URL
  warn-empty: OTEL_EXPORTER_OTLP_ENDPOINT
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
      "extra": [],
      "optional": [],
      "warning": [
        "SLACK_WEBHOOK_URL"
      ],
      "warnMissing": [
        "SLACK_WEBHOOK_URL"
      ],
      "warnEmpty": [],
      "ok": false
    }
  ]
}
```

## Why this exists

Many teams keep `.env.example` around but do not actually verify deploy-time env files against it, or they need more nuance than just pass or fail. This tool is intentionally small enough to drop into CI, pre-deploy scripts, or local sanity checks while still letting one manifest describe hard requirements, optional keys, and recommended integrations.

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

- shell-friendly summary mode
- severity customization for extra keys
- config file support for shared project defaults

## Contributing

Bug reports and pull requests are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Development

```bash
npm test
npm run pack:check
```
