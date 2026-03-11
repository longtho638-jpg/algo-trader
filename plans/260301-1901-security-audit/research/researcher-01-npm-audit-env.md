# Research: npm audit & env security

## Findings

- **pnpm-lock.yaml** exists at monorepo root — `pnpm audit` works
- **npm audit** fails with ENOLOCK (no package-lock.json) — must use `pnpm audit`
- **.env.example** already exists with 13+ env vars (exchange keys, trading params)
- **.gitignore** properly excludes `.env`, `.env.local`
- **No actual .env file** found in repo
- All secrets loaded via `process.env` — no hardcoded values
- Config validation prevents startup with missing/placeholder keys

## Security Posture: STRONG
