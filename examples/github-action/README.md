# GitHub Action Example

Validate CI and production env files before merge or deploy.

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
      - uses: eunsujihoon-hub/safe-dotenv-check@v1.4.0
        with:
          example: .env.example
          env_files: |
            .env.ci
            .env.production
          env_names: |
            ci
            production
          extra: warn
          show_descriptions: true
          json_output_path: artifacts/env-report.json
```

The action writes a JSON report and a human-readable GitHub step summary.
