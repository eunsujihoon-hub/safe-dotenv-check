# safe-dotenv-check

Small CLI to compare required environment keys from a manifest file such as `.env.example` against one or more target `.env` files.

It focuses on the checks that usually break deploys:

- missing required keys
- empty values for required keys
- unexpected extra keys

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

## Development

```bash
npm test
```
