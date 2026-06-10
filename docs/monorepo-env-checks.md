# Monorepo Env Checks

Monorepos usually have two problems at once:

- multiple apps with different `.env` contracts
- shared CI where one bad env file can break the wrong deploy at the wrong time

`safe-dotenv-check` works best here when each app keeps its own manifest and CI validates only the env files relevant to that app.

## Example layout

```text
apps/
  web/
    .env.example
    .env.production
  worker/
    .env.example
    .env.production
```

## Example CI job

```yaml
jobs:
  web-env-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: eunsujihoon-hub/safe-dotenv-check@v1.3.0
        with:
          example: apps/web/.env.example
          env_files: apps/web/.env.production
          env_names: production

  worker-env-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: eunsujihoon-hub/safe-dotenv-check@v1.3.0
        with:
          example: apps/worker/.env.example
          env_files: apps/worker/.env.production
          env_names: production
```

## Practical tips

- keep contracts close to each app instead of one giant root manifest
- use `env=` for app-specific deploy rules
- use `--allow-extra` only when the extra keys are truly expected
- keep JSON reports if another workflow step needs structured output

## Related

- [Back to README](../README.md)
- [GitHub Actions guide](./github-actions.md)
