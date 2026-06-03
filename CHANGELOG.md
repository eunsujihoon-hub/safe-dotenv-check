# Changelog

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
