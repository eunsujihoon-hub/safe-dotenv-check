# safe-dotenv-check

[![CI](https://github.com/eunsujihoon-hub/safe-dotenv-check/actions/workflows/ci.yml/badge.svg)](https://github.com/eunsujihoon-hub/safe-dotenv-check/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

Small CLI to compare required environment keys from a manifest file such as `.env.example` against one or more target `.env` files.

It focuses on the checks that usually break deploys:

- missing required keys
- empty values for required keys
- unexpected extra keys
- machine-readable JSON output for CI or deployment checks

## Install

```bash
npm install --global safe-dotenv-check
```

Or run it without installing:

```bash
npx safe-dotenv-check --example .env.example --env .env
```

## Usage

```bash
safe-dotenv-check --example .env.example --env .env
safe-dotenv-check --example .env.example --env .env --env .env.production
safe-dotenv-check --example .env.example --env .env --allow-extra
safe-dotenv-check --example .env.example --env .env --format json
```

## Exit codes

- `0`: all files passed
- `1`: at least one file has missing or empty required keys
- `2`: invalid CLI usage or unreadable files

## What counts as required

Every non-comment key in the example file is treated as required.

Example:

```dotenv
# .env.example
DATABASE_URL=
OPENAI_API_KEY=
LOG_LEVEL=info
```

## Output example

```text
PASS .env
FAIL .env.production
  missing: OPENAI_API_KEY
  empty: DATABASE_URL
  extra: DEBUG
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
      "ok": false
    }
  ]
}
```

## Why this exists

Many teams keep `.env.example` around but do not actually verify deploy-time env files against it. This tool is intentionally small enough to drop into CI, pre-deploy scripts, or local sanity checks.

## Roadmap

- optional support for warning-only keys
- shell-friendly summary mode
- GitHub Action wrapper

## Contributing

Bug reports and pull requests are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Development

```bash
npm test
```
