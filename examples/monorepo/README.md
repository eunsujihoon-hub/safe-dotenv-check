# Monorepo Example

Run the same contract checker against each app's manifest and env file.

```bash
safe-dotenv-check --example apps/web/.env.example --env apps/web/.env.production --env-name production
safe-dotenv-check --example apps/api/.env.example --env apps/api/.env.production --env-name production
safe-dotenv-check --example packages/worker/.env.example --env packages/worker/.env.production --env-name production
```

For gradual adoption, start with warnings for extra keys:

```bash
safe-dotenv-check --example apps/web/.env.example --env apps/web/.env.production --extra warn
```
