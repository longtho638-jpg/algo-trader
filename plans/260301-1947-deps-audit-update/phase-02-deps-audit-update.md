---
title: "Dependencies Audit & Update"
status: pending
effort: 15m
---

# Phase 02: Dependencies Audit & Update

## Context
- Parent: [plan.md](./plan.md)
- Depends on: Phase 01 (clean git state first)

## Overview
Run `npm outdated`, update critical deps, run `npm audit fix`, commit lock file.

## Current Dependencies

**Runtime:** ccxt ^4.5.36, chalk ^4.1.2, commander ^11.1.0, dotenv ^16.6.1, technicalindicators ^3.1.0, winston ^3.19.0
**Workspace:** @agencyos/trading-core, vibe-arbitrage-engine, vibe-billing-trading
**Dev:** typescript ^5.9.3, jest ^29.7.0, ts-jest ^29.4.6, ts-node ^10.9.0, @types/node ^20.19.32

## Implementation Steps

1. `npm outdated` — identify outdated packages
2. Update critical deps (security/major only, skip minor cosmetic bumps)
3. `npm audit` — check vulnerabilities
4. `npm audit fix` — auto-fix where possible
5. Verify build still passes: `npm run build`
6. Verify tests still pass: `npm test`
7. `git add package.json package-lock.json` (if lock file exists)
8. `git commit -m 'chore(algo-trader): update dependencies, fix audit issues'`

## Risk Assessment
- **Workspace deps** (`workspace:*`) — cannot be outdated-checked via npm outdated
- **ccxt** — major version bumps may break exchange API calls (test carefully)
- **typescript** — major bump could introduce new strict errors

## Success Criteria
- [ ] `npm audit` shows 0 critical/high vulnerabilities
- [ ] `npm ls --depth=0` clean (no peer dep errors)
- [ ] Build + tests still pass after updates
