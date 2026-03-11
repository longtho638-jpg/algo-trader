---
title: "algo-trader deps update & audit fix"
description: "Update outdated pnpm deps (commander, dotenv), verify 0 critical vulns"
status: pending
priority: P3
effort: 30m
branch: master
tags: [dependencies, security, maintenance]
created: 2026-03-01
---

# algo-trader: Dependency Update & Audit Fix

## Summary

Update `commander` (11→14) and `dotenv` (16→17) in algo-trader. Skip chalk v5 (ESM-only, breaking). Verify 0 critical vulnerabilities after update.

## Context

- Monorepo root: `/Users/macbookprom1/mekong-cli`
- Package manager: `pnpm@9.15.0`
- App path: `apps/algo-trader`
- Workspace: `@agencyos/algo-trader`

## Phases

| # | File | Status | Effort |
|---|------|--------|--------|
| 1 | [phase-01-update-deps.md](./phase-01-update-deps.md) | pending | 15m |
| 2 | [phase-02-audit-fix-verify.md](./phase-02-audit-fix-verify.md) | pending | 10m |
| 3 | [phase-03-commit.md](./phase-03-commit.md) | pending | 5m |

## Key Decisions

- **chalk**: Keep at v4.1.2 — v5 is ESM-only, project uses CommonJS. No vulnerabilities, no action needed.
- **commander**: Update 11→14 — low risk, backward-compatible API.
- **dotenv**: Update 16→17 — low risk, no code changes required.
- **xlsx vuln**: In `com-anh-duong-10x`, not algo-trader. No action for this task.

## Success Criteria

- `pnpm audit --filter algo-trader` → 0 critical
- `pnpm ls --filter algo-trader --depth=0` → clean tree
- `pnpm-lock.yaml` committed
- No TypeScript errors, no failing tests
