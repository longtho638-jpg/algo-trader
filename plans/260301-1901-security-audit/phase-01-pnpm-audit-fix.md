# Phase 01: pnpm audit fix

## Context
- Parent: [plan.md](./plan.md)
- Research: [researcher-01](./research/researcher-01-npm-audit-env.md)

## Parallelization
- **Group A** — runs parallel with Phase 02
- **No dependencies** on other phases

## Overview
- Priority: P2
- Status: pending
- Fix dependency vulnerabilities via pnpm audit

## Key Insights
- Monorepo uses pnpm — `npm audit` fails with ENOLOCK
- Must run `pnpm audit` from monorepo root
- Root package.json already has pnpm overrides for known vulns

## Requirements
- Run `pnpm audit --filter algo-trader` to scope to this package
- Fix critical/high vulnerabilities
- Use pnpm overrides in root package.json if direct fix unavailable

## File Ownership
- `/Users/macbookprom1/mekong-cli/package.json` (pnpm.overrides section only)
- No algo-trader src files modified

## Implementation Steps
1. `cd /Users/macbookprom1/mekong-cli && pnpm audit --filter algo-trader` — capture output
2. If critical/high found: `pnpm audit fix --filter algo-trader` or add overrides
3. If overrides needed: edit root `package.json` pnpm.overrides
4. Re-run `pnpm install` to regenerate lockfile
5. Verify: `pnpm audit --filter algo-trader` shows 0 critical/high

## Todo
- [ ] Run pnpm audit
- [ ] Fix critical/high vulnerabilities
- [ ] Verify 0 critical/high remaining

## Success Criteria
- `pnpm audit --filter algo-trader` returns 0 critical/high vulnerabilities

## Conflict Prevention
- Only touches root package.json pnpm.overrides — no overlap with Phase 02

## Risk Assessment
- LOW: pnpm overrides may affect other workspace packages — test after

## Security Considerations
- Keep overrides minimal — only for verified safe versions
