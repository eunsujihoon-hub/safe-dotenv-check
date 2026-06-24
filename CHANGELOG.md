# Changelog

## 1.5.2 - 2026-06-24

- warn in `--doctor` when a manifest key mixes optional and warning-only tiers
- warn in `--doctor` about unknown directive-like tokens, with suggestions for common typos
- recognize `added-by=` and `source=` annotations as first-class manifest metadata
- keep compact secret-like keys such as `OPENAI_APIKEY`, `CLIENT_SECRET`, `JWTSECRET`, and `ACCESSKEY` from getting value-based `--init` schema guesses

## 1.5.1 - 2026-06-22

- keep key-based `--init` schema hints from being overwritten by misleading example values
- avoid inferring numeric, boolean, or JSON schema rules from secret-like keys such as API keys, tokens, passwords, and private keys
- make `--sync-example` preview output match the exact lines that `--write` would append
- quote annotated source paths when needed so paths with spaces stay readable

## 1.5.0 - 2026-06-19

- infer common schema directives when `--init` creates a starter manifest from real env values
- strengthen `--preset nextjs`, `--preset vite`, and `--preset node` with framework-aware URL, port, and `NODE_ENV` hints
- add `--write-missing` as a shorter alias for `--sync-example --write`
- add `--annotate` so generated and synced keys can include source hints
- sharpen README onboarding around broken deploy prevention and one-command contract bootstrap

## 1.4.1 - 2026-06-15

- reject missing values for option flags such as `--example`, `--env`, `--format`, `--extra`, `--preset`, and `--out` before file validation runs
- fix `--init --out` without a value so it reports a clear usage error instead of falling back to `.env.example`
- warn in `--doctor` when duplicate manifest keys overlap and the later entry will win

## 1.4.0 - 2026-06-12

- tighten the README so the first screen explains the problem, value, quick start, and failure output faster
- add npm, Node, and CodeQL badges for stronger GitHub and npm trust signals
- add focused examples for Next.js, GitHub Actions, and monorepo adoption
- add a release checklist for repeatable npm package and GitHub Action publishing
- add GitHub Marketplace branding to the Action
- add `--quiet` / `-q` text output mode for CI logs that should show only failures and warnings

## 1.3.0 - 2026-06-10

- add `--extra fail|warn|ignore` so teams can adopt extra-key checks gradually while keeping `--allow-extra` as a compatibility alias
- add next-action suggestions to CLI text output and JSON reports
- add `--redact-values` and make the GitHub Action redact invalid raw values by default
- add `--init`, `--preset`, and `--sync-example` helpers for creating and maintaining `.env.example` files
- add `--doctor` / `--explain` manifest linting for invalid regex patterns, unknown types, empty enums, and confusing descriptions
- improve description parsing when an unquoted description is followed by another directive
- replace the wide GitHub Action summary table with per-file sections
- automatically create or update the GitHub Release after a successful tagged publish
- ignore npm tarball artifacts and update setup docs to the latest action version

## 1.2.4 - 2026-06-08

- fix the action smoke workflow so it no longer reads a per-step GitHub summary file from a later assertion step
- keep the description-reporting feature and provenance publish settings from 1.2.3 as the latest release

## 1.2.3 - 2026-06-08

- add `--show-descriptions` so CLI text and JSON reports can include manifest `desc=`/`description=` context
- expose `show_descriptions` in the GitHub Action and include description notes in the step summary
- publish future releases with `npm publish --provenance --access public` to keep npm provenance metadata complete

## 1.2.2 - 2026-06-07

- verify the published Node support range in CI with a Node 18, 20, and 22 matrix
- strengthen the GitHub Action smoke workflow with success and failure path assertions, JSON report checks, and step summary checks
- improve README onboarding with a minimal manifest example plus text and JSON output examples
- add practical setup guides for GitHub Actions, Next.js env contracts, and monorepo env checks
- remove repository noise from stray Finder metadata

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
