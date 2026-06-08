# safe-dotenv-check

[![CI](https://github.com/eunsujihoon-hub/safe-dotenv-check/actions/workflows/ci.yml/badge.svg)](https://github.com/eunsujihoon-hub/safe-dotenv-check/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

Validate `.env` files against `.env.example` before broken config reaches CI or production.

`safe-dotenv-check` is for teams that already keep a `.env.example`, but still get burned by missing keys, empty values, wrong value shapes, or environment drift between local, staging, and production.

It gives you:

- missing and empty required key checks
- optional and warning-only env keys
- schema rules like `type=`, `enum=`, and `pattern=`
- environment-specific contracts like `env=production`
- plain CLI output plus JSON output for CI
- optional descriptions in reports when a key needs context
- a reusable GitHub Action for repo-level env checks

Quick start:

```bash
npx safe-dotenv-check
```

If `.env.example` and `.env` exist in the current directory, that is enough to run the default check.

Minimal manifest example:

```dotenv
# .env.example
DATABASE_URL= # type=url
OPENAI_API_KEY=
?SENTRY_DSN=
!SLACK_WEBHOOK_URL=
NODE_ENV=development # enum=development|staging|production
```

Typical failure output:

```text
FAIL .env.production (production)
  missing: OPENAI_API_KEY
  invalid: DATABASE_URL (type=url), NODE_ENV (enum=development|staging|production)
```

The same check in JSON for CI:

```bash
safe-dotenv-check --example .env.example --env .env.production --env-name production --format json
```

If the main problem is "this should fail before deploy", jump straight to [GitHub Action](#github-action).

If you want the longer version of the problem this solves, read [Why `.env.example` is not enough](./docs/why-env-example-is-not-enough.md).
If you want concrete setups, see [GitHub Actions guide](./docs/github-actions.md), [Next.js env contract guide](./docs/nextjs-env-contract.md), and [monorepo env checks](./docs/monorepo-env-checks.md).

This came out of a pretty boring failure mode: the repo had `.env.example`, everyone assumed the env story was handled, and then the deploy still broke because the real runtime env had drifted.

Most of the time the failure was not dramatic. It was small stuff that wasted time:

- one required key missing in staging
- a key present but effectively empty
- an integration that should be there, but should not block release
- a value that exists, but is obviously the wrong shape

I did not want a big config framework for that. I wanted something small and stable enough to run locally or in CI, but strict enough to catch the annoying stuff before it turned into a deploy chase.

That is what `safe-dotenv-check` is for. It checks a manifest such as `.env.example` against one or more target `.env` files and focuses on the things that usually matter when you are actually shipping:

- required keys that must exist
- optional keys that are documented but not enforced
- warning-only keys that should exist but should not block deploys
- empty values for required keys
- schema validation for typed values such as integers, URLs, booleans, JSON, enums, and regex patterns
- unexpected extra keys
- machine-readable JSON output for CI or deployment checks
- a reusable GitHub Action wrapper for repository-level checks

The whole point is to stop `.env.example` from turning into documentation theater and make it useful as a small, stable env contract for local development, CI, and deploy-time checks.

## Feature overview

If you want the short version of what this tool actually does, this is the practical checklist:

- compare one manifest against one or more real env files
- fail on missing required keys
- fail on required keys that exist but are effectively empty
- allow documented optional keys without forcing them everywhere
- warn on recommended integrations without blocking deploys
- validate value shape with `type=`, `enum=`, and `pattern=`
- scope the same key differently across `dev`, `staging`, `production`, or any env name you use
- keep short descriptions next to each key so the manifest stays readable
- emit plain terminal output for humans and JSON output for CI or scripts
- run the same contract through a GitHub Action without duplicating logic

It is intentionally small. The goal is not to replace runtime config libraries. The goal is to catch env drift early enough that you do not burn release time on it.

## Install

Nothing special here.

```bash
npm install --global safe-dotenv-check
```

Or run it without installing:

```bash
npx safe-dotenv-check
npx safe-dotenv-check .env.production
npx safe-dotenv-check --example .env.example --env .env
```

If `.env.example` and `.env` exist in the current directory, you can run the tool with no flags and it will use those defaults. Positional arguments are treated as target env files, so `safe-dotenv-check .env.production` is equivalent to `safe-dotenv-check --env .env.production`.

## GitHub Action

If the main pain is "this should fail in CI before someone merges or deploys", use the action directly:

```yaml
jobs:
  env-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: eunsujihoon-hub/safe-dotenv-check@v1.2.3
        with:
          example: .env.example
          env_files: |
            .env.ci
            .env.production
          env_names: |
            ci
            production
```

Inputs:

- `example`: manifest path such as `.env.example`
- `env_files`: newline-separated target env file paths
- `env_names`: optional newline-separated logical env names, once or once per env file
- `allow_extra`: set to `true` to ignore keys that exist only in target files
- `show_descriptions`: set to `true` to include manifest `desc=`/`description=` text in reports
- `summary`: set to `false` to skip step summary output
- `json_output_path`: optional path where the JSON report should be copied

If you want a copy-paste setup guide instead of just the raw action inputs, see [docs/github-actions.md](./docs/github-actions.md).

## Usage

The basic shape is always the same: point at the manifest, then point at the env file you actually care about.

```bash
safe-dotenv-check
safe-dotenv-check .env.production
safe-dotenv-check --example .env.example --env .env
safe-dotenv-check --example .env.example --env .env --env .env.production
safe-dotenv-check --example .env.example --env .env.production --env-name production
safe-dotenv-check --example .env.example --env .env --allow-extra
safe-dotenv-check --example .env.example --env .env --format json
safe-dotenv-check --example .env.example --env .env --show-descriptions
```

If you do not pass `--env-name`, the CLI also infers names from files such as `.env.production` and `.env.staging.local`.

## Exit codes

- `0`: all files passed
- `1`: at least one file has missing or empty required keys, or unexpected extra keys when `--allow-extra` is not set
- `2`: invalid CLI usage or unreadable files

## Manifest tiers

In practice I kept needing three different levels, not just pass/fail:

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

Inline comments after an unquoted value are ignored, so `API_KEY= # comment` is treated as empty. That one is in here because it is an easy way for a key to look present while still being effectively blank.

### Tier behavior at a glance

- `required`
  - missing: fail
  - empty: fail
  - invalid by schema: fail
- `optional`
  - missing: ignored
  - empty: ignored
  - invalid by schema: fail only when the key is present and non-empty
- `warning-only`
  - missing: warn
  - empty: warn
  - invalid by schema: warn

## Environment-specific rules

One thing that kept coming up in real projects was that the same key was not always treated the same way everywhere. A key could be optional in local dev, required in production, and irrelevant in CI.

So manifest lines can be scoped with `env=`:

```dotenv
DATABASE_URL=postgres://localhost/app # type=url desc="Shared database connection"
?SENTRY_DSN= # env=dev desc=Local error tracking only
SENTRY_DSN= # env=production desc=Production error tracking DSN
!SLACK_WEBHOOK_URL= # env=staging,production desc="Deploy notifications"
```

Then pick the active contract with `--env-name`:

```bash
safe-dotenv-check --example .env.example --env .env --env-name dev
safe-dotenv-check --example .env.example --env .env.production --env-name production
```

Rules without `env=` apply everywhere. Rules with `env=` only apply when the selected env name matches. Both `env=staging,production` and `env=staging|production` are supported.

## Schema rules

After the "is the key there?" problem, the next problem was usually "the value is there, but obviously wrong". So schema directives live in the inline comment area of each manifest entry:

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
- `type=integer` (alias of `type=int`)
- `type=number`
- `type=boolean`
- `type=url`
- `type=json`
- `enum=value1|value2|value3`
- `pattern=<regex>`

How the rules behave:

- missing required keys still fail before schema validation
- empty required keys still fail as empty values
- optional keys are validated only when present and non-empty
- warning-only keys report invalid values as warnings instead of failures
- `type`, `enum`, and `pattern` can be combined on the same key

Supported built-in type checks in plain language:

- `string`: always valid as long as the key exists
- `int`: whole numbers such as `3000` or `-1`
- `number`: anything JavaScript can parse as a finite number
- `boolean`: `true`, `false`, `1`, `0`, `yes`, `no`, `on`, `off`
- `url`: must parse as a URL with protocol and host
- `json`: must parse as valid JSON

## Descriptions

This part is deliberately small, but useful. Manifest lines can carry a short description so the contract is not just strict, but readable:

```dotenv
DATABASE_URL=postgres://localhost/app # type=url desc="Primary Postgres connection"
OPENAI_API_KEY= # env=production desc=Server-side OpenAI key
```

Supported forms:

- `desc=...`
- `description=...`

Quoted descriptions are safest if they contain spaces. Unquoted descriptions also work and are easiest when the description is the last directive on the line.

Directive parsing ignores words that only appear inside `desc=` or `description=` text, so prose such as `desc="optional for local testing"` will stay a description instead of changing validation behavior.

Right now descriptions are stored in the manifest spec and carried into JSON validation entries when a typed rule fails. The immediate use is better contract readability, and it also sets up future doc generation without inventing a separate metadata file.

When you want the report itself to explain what each key is for, pass `--show-descriptions`:

```bash
safe-dotenv-check --example .env.example --env .env.production --show-descriptions
```

```text
FAIL .env.production
  missing: OPENAI_API_KEY - Server-side OpenAI key
  empty: DATABASE_URL - Primary Postgres connection
```

That means the manifest can do double duty:

- strict enough for checks
- readable enough to act as lightweight env documentation

Realistically, this is the kind of manifest line I wanted to write:

```dotenv
DATABASE_URL=postgres://localhost/app # type=url
PORT=3000 # type=int
NODE_ENV=development # enum=development|test|production
FEATURE_FLAGS={"beta":false} # type=json optional
!OTEL_EXPORTER_OTLP_ENDPOINT=https://otel.example.com # type=url
```

## Output example

The output is intentionally plain. The goal is to be readable in a terminal or CI log without making you decode a custom format.

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

If this is feeding another script or CI step, use JSON:

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
          "expected": "type=int",
          "description": "Primary API port"
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
      "envName": "production",
      "ok": false
    }
  ]
}
```

## Why this exists

I made this after running into the same pattern enough times that it stopped feeling accidental:

- `.env.example` existed, so everyone assumed the env story was covered
- local worked, but staging or CI had one missing key
- sometimes the key existed, but was blank because somebody copied a template line and forgot the value
- sometimes a key was technically present, but the value was wrong enough that the app still booted into a bad state

Most dotenv tooling I tried landed in one of two buckets:

- too loose, so it did not really help at deploy time
- too binary, so it did not fit how real projects usually treat integrations and optional services

In practice, teams usually need three different levels:

- things that must be present
- things that are optional and just documented
- things that are recommended and worth warning about

And once a team starts caring about that, the next question is almost always type or format validation.

So the tool stayed intentionally small, but tried to match how env problems actually show up during work: not as some grand config architecture problem, but as one stupid mismatch that quietly burns 20 to 40 minutes right before a release.

## When this is useful

- you already keep a `.env.example`, but nobody really trusts it
- staging and production drift from local more often than they should
- you want CI to catch env mistakes before deploy time
- you need a little more nuance than just "required" and "not required"
- you want simple type checks without introducing a bigger config layer

## When this is probably overkill

- the project only has a couple of env vars and one deploy target
- the team already validates env through a different runtime config system
- you do not actually want `.env.example` to be a contract, just a loose sample

## Secret safety

This repository ignores common secret-bearing files by default because the point is to validate the shape of env config, not encourage people to commit real secrets:

- `.env`
- `.env.local`
- `.env.production.local`
- `.envrc`
- `secrets/`
- certificate and private key files such as `*.pem` and `*.key`

Commit only redacted examples such as `.env.example`. Do not commit real credentials just because the tool checks them.

## Roadmap

- generated env reference docs from the manifest
- stricter controls for unexpected extra keys
- platform adapters for GitHub Actions secrets and hosted deploy platforms

## Contributing

Bug reports and pull requests are welcome. If you hit a real env mismatch that this tool should catch better, that is especially useful context. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Development

```bash
npm test
npm run pack:check
```
