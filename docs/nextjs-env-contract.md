# Next.js Env Contract Guide

Next.js projects often look organized because they already have `.env.local`, `.env.production`, and a checked-in `.env.example`.

That still leaves a common problem: the example file exists, but nobody verifies the real values that matter in CI or production.

## Example manifest

```dotenv
# .env.example
NEXT_PUBLIC_APP_URL=https://example.com # type=url
NEXT_PUBLIC_API_BASE_URL=https://api.example.com # type=url
DATABASE_URL= # type=url env=production
OPENAI_API_KEY= # env=production
?SENTRY_AUTH_TOKEN= # env=ci
!SLACK_WEBHOOK_URL= # env=staging,production
NODE_ENV=development # enum=development|test|production
```

## Local check

```bash
npx safe-dotenv-check --example .env.example --env .env.local --env-name dev
```

## Production check

```bash
npx safe-dotenv-check --example .env.example --env .env.production --env-name production
```

## Why this works well for Next.js

- public and server-only keys live in one readable contract
- production-only integrations can stay strict without making local setup annoying
- obviously broken URLs and enums fail before deploy
- warning-only integrations still show up without blocking every branch

## Related

- [Back to README](../README.md)
- [GitHub Actions guide](./github-actions.md)
