# Next.js Example

Use one manifest for local, CI, and production checks.

```dotenv
# .env.example
DATABASE_URL= # type=url desc="Primary database"
NEXT_PUBLIC_APP_URL=https://example.com # type=url
NODE_ENV=development # enum=development|test|production
?SENTRY_DSN= # env=development desc="Optional local error tracking"
SENTRY_DSN= # env=production desc="Production error tracking"
```

```bash
safe-dotenv-check --example .env.example --env .env.local --env-name development --extra warn
safe-dotenv-check --example .env.example --env .env.production --env-name production
```
