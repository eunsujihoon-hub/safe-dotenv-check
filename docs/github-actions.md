# GitHub Actions Guide

If you want `.env` contract checks to block bad merges or bad deploys, this is the shortest reliable setup.

## Basic pull request check

```yaml
name: env-check

on:
  pull_request:
  push:
    branches:
      - main

jobs:
  env-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: eunsujihoon-hub/safe-dotenv-check@v1.4.1
        with:
          example: .env.example
          env_files: .env.ci
          env_names: ci
```

That gives you:

- normal action failure when required keys are missing or invalid
- a readable step summary in the Actions UI
- a reusable contract without writing your own shell parser

## Validate multiple env files in one job

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
```

This is useful when local development is loose, but CI and production are stricter.

## Keep the JSON report

If another step needs machine-readable output, copy the report to a stable path:

```yaml
jobs:
  env-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: eunsujihoon-hub/safe-dotenv-check@v1.4.1
        with:
          example: .env.example
          env_files: .env.production
          env_names: production
          json_output_path: artifacts/env-report.json
```

That report is plain JSON, so you can upload it as an artifact or inspect it in a later step.
The action redacts invalid raw values from JSON by default so reports are safer to keep as artifacts.

## Adopt gradually with extra-key warnings

If an existing project has target env files with extra keys that are not in the manifest yet, start with warnings instead of blocking the job:

```yaml
jobs:
  env-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: eunsujihoon-hub/safe-dotenv-check@v1.4.1
        with:
          example: .env.example
          env_files: .env.production
          env_names: production
          extra: warn
```

Use `extra: fail` once the manifest is fully synced, or `extra: ignore` when those keys are intentionally outside the contract.

## Show key descriptions

If your manifest uses `desc=` or `description=`, include those notes in the JSON report and step summary:

```yaml
with:
  example: .env.example
  env_files: .env.production
  show_descriptions: true
```

## Good manifest habits for CI

- keep truly required production keys as required
- mark developer-only helpers as optional
- mark non-blocking integrations as warning-only
- use `type=`, `enum=`, and `pattern=` for obviously wrong values
- use `env=` when the same key has different rules in `dev`, `ci`, and `production`
- keep `redact_values` enabled unless you have a specific reason to store invalid raw values

## Related

- [Back to README](../README.md)
- [Why `.env.example` is not enough](./why-env-example-is-not-enough.md)
