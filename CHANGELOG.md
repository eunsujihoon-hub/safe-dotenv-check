# Changelog

## 1.2.1 - 2026-06-05

- improve README conversion copy so the problem, audience, and quick start are visible immediately
- add a searchable explainer doc: `Why .env.example is not enough`
- update package metadata and repository topics for better npm and GitHub discovery

## 1.2.0 - 2026-06-05

- prevent words inside `desc=` and `description=` text from changing manifest validation rules
- allow zero-config CLI runs by defaulting to local `.env.example` and `.env` files when present
- accept positional env file arguments and infer env names from paths such as `.env.production`
- escape GitHub Action step summary table cells so enum and regex output stays readable

## 1.1.0 - 2026-06-04

- add env-scoped manifest rules via `env=` so keys can be optional in one environment and required in another
- add `desc=` and `description=` manifest directives for lightweight key descriptions
- expose selected env names in CLI JSON output and GitHub Action summaries
- extend the GitHub Action with `env_names` input for env-specific contract checks

## 1.0.1 - 2026-06-04

- add `type=integer` as an alias for `type=int` in manifest schema rules

## 1.0.0 - 2026-06-04

- add contract-style schema validation with `type=`, `enum=`, and `pattern=` manifest directives
- validate optional keys when present and non-empty, while keeping warning-only invalid values non-blocking
- include invalid and warn-invalid findings in CLI text output, JSON output, and GitHub Action summaries
- reposition the project around env contracts for local, CI, and deploy-time checks

## 0.3.0 - 2026-06-04

- add warning-only manifest keys via `!KEY=` or `KEY= # warn`
- report warning-only missing or empty values without failing the CLI exit code
- document the new deploy-focused manifest tiers in README examples

## 0.2.2 - 2026-06-03

- fix inline comment parsing so `KEY= # comment` is treated as an empty value
- add regression tests for empty inline-comment values and quoted hash values
- clarify README exit code behavior for unexpected extra keys

## 0.2.1 - 2026-06-03

- normalize the published CLI bin path for npm package metadata

## 0.2.0 - 2026-06-03

- add a reusable GitHub Action wrapper with step summary output
- add an action smoke test workflow
- add publish safety checks via `prepublishOnly` and `npm pack --dry-run`
- include `action.yml` in the published package

## 0.1.0 - 2026-06-03

- initial CLI release
- `.env.example` versus target `.env` comparison
- missing, empty, and extra key detection
- JSON output mode
- optional key support via `?KEY=` or `KEY= # optional`
- basic CI and test coverage
- security guidance and secret-safe ignore defaults
- repository health files for contribution and triage
