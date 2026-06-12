# Release Checklist

Use this before publishing a new npm package and GitHub Action tag.

1. Update `CHANGELOG.md` with user-facing changes.
2. Run `npm test`.
3. Run `npm run pack:check`.
4. Bump `package.json` with `npm version patch|minor|major`.
5. Push `main` and the new tag.
6. Confirm the `publish` workflow completed.
7. Confirm npm shows the new version.
Prefer patch releases for docs, examples, and backwards-compatible CLI conveniences.
