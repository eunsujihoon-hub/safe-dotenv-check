# Security

## Reporting a vulnerability

If you find a security issue in `safe-dotenv-check`, please do not open a public issue with sensitive details.

Instead:

- redact secrets from all examples
- describe the impact clearly
- include a minimal reproduction without real credentials

## Secret handling

This project is intended to validate env file shape, not to collect or transmit secret values.

Repository defaults are set to avoid committing common secret-bearing files, including:

- `.env`
- `.env.local`
- `.env.production.local`
- `.envrc`
- `secrets/`
- `*.pem`
- `*.key`

If you use this tool in CI, prefer masked secrets and generated ephemeral env files over long-lived checked-in credentials.
