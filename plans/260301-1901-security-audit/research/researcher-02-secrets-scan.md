# Research: Secrets scan in src/

## Findings

- **No hardcoded secrets** — all API keys via process.env
- **No Bearer tokens** or embedded credentials in URLs
- **Config pattern**: dotenv → process.env → validation → reject if default
- **10 env vars** tracked across config.ts and exchange-factory.ts
- **Minor**: dual env var names (EXCHANGE_API_KEY || API_KEY) — standardize recommended

## Security Posture: GOOD
- No action needed for secrets remediation
