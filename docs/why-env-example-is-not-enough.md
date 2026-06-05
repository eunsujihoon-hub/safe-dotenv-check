# Why `.env.example` Is Not Enough

Many projects already have a `.env.example` file.

That usually creates a false sense of safety.

The file exists, so everyone assumes the environment setup is documented. The app works locally for one person, so everyone assumes staging and production are probably fine too. Then a deploy fails because one required key is missing, a copied value is empty, or a variable exists but is clearly the wrong shape.

That failure mode is boring, but it is common.

## The real problem

In practice, `.env.example` often ends up as documentation theater:

- it lists keys, but nobody checks real env files against it
- it does not tell you which keys are optional versus required
- it cannot warn about integrations that matter but should not block deploys
- it cannot catch obviously broken values such as invalid URLs, bad enums, or malformed JSON
- it does not account for the fact that local, staging, CI, and production often need different rules

So the file exists, but the contract does not.

## What teams actually need

Most teams do not need a large configuration framework just to solve this.

They usually need a small contract check that can answer a few practical questions before code ships:

- Are the required keys present?
- Are any required values effectively empty?
- Are there extra keys that should not be there?
- Are some keys optional or warning-only?
- Does this value at least look like the right type?
- Does production require something that local development does not?

That is the gap `safe-dotenv-check` is meant to close.

## What `safe-dotenv-check` does

`safe-dotenv-check` validates one or more real `.env` files against a `.env.example`-style manifest and adds a few useful layers:

- required, optional, and warning-only keys
- schema directives like `type=`, `enum=`, and `pattern=`
- environment-specific rules with `env=production` or `env=staging,production`
- JSON output for CI or scripts
- a GitHub Action wrapper for repository-level checks

It is intentionally narrow in scope. The goal is not to replace runtime config libraries. The goal is to catch configuration drift before it turns into a release problem.

## Example

```dotenv
# .env.example
DATABASE_URL= # type=url
OPENAI_API_KEY=
?SENTRY_DSN= # env=dev
SENTRY_DSN= # env=production
!SLACK_WEBHOOK_URL= # env=staging,production
```

```bash
npx safe-dotenv-check
safe-dotenv-check .env.production
safe-dotenv-check --example .env.example --env .env.production --env-name production
```

## When this is useful

This tool is a good fit if:

- you already keep `.env.example` in the repo
- CI or deploys still break because of env drift
- you want a lightweight env validator instead of a bigger config system
- you want your env example file to behave like an actual contract

If that sounds familiar, the README is the best next stop:

- [Back to README](../README.md)
