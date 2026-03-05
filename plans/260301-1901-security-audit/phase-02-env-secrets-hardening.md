# Phase 02: env + secrets hardening

## Context
- Parent: [plan.md](./plan.md)
- Research: [researcher-02](./research/researcher-02-secrets-scan.md)

## Parallelization
- **Group A** — runs parallel with Phase 01
- **No dependencies** on other phases

## Overview
- Priority: P2
- Status: pending
- Verify .env.example completeness, scan src/ for secrets

## Key Insights
- `.env.example` already exists with 13+ vars
- No hardcoded secrets found in src/
- .gitignore properly excludes .env files
- Minor: dual env var naming (EXCHANGE_API_KEY || API_KEY)

## Requirements
- Verify .env.example covers ALL process.env references in src/
- Confirm no secrets leaked in source code
- Document any missing env vars in .env.example

## File Ownership
- `apps/algo-trader/.env.example` (update if missing vars)
- `apps/algo-trader/src/` (read-only scan)

## Implementation Steps
1. Grep all `process.env.` references in src/
2. Compare with .env.example entries
3. Add any missing vars to .env.example with placeholder values
4. Final secrets scan: grep for patterns (sk-, pk_, Bearer, hardcoded URLs)
5. Report findings

## Todo
- [ ] Cross-reference process.env usage vs .env.example
- [ ] Add missing env vars to .env.example
- [ ] Confirm 0 hardcoded secrets

## Success Criteria
- .env.example covers 100% of process.env references
- `grep -r "sk-\|pk_\|Bearer " src/` returns 0 results

## Conflict Prevention
- Only touches .env.example — no overlap with Phase 01

## Risk Assessment
- LOW: .env.example changes are documentation only

## Security Considerations
- Never add actual secret values to .env.example
- Use descriptive placeholders (your_api_key_here)
