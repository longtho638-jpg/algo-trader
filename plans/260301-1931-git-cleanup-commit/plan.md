---
title: "algo-trader git cleanup commit"
description: "Stage all changes, verify .gitignore, commit modularization + cleanup"
status: pending
priority: P3
effort: 10m
branch: master
tags: [git, cleanup, commit]
created: 2026-03-01
---

# algo-trader: Git Cleanup & Commit

## Summary

Commit modularization refactor: 5 modified files (-925 lines extracted), 8 new modular files, 2 plan dirs. Verify .gitignore covers sensitive paths before staging.

## Current State

**Modified (5):**
- `package.json` — dep version bumps
- `src/backtest/BacktestEngine.ts` — extracted metrics/stats calculator
- `src/cli/arb-cli-commands.ts` — extracted scan/run + orchestrator + AGI commands
- `src/core/BotEngine.ts` — extracted config/state types + trade executor
- `src/core/bot-engine-plugins.ts` — extracted builtin plugin factories

**Untracked (8 code + 2 plan dirs):**
- `src/backtest/backtest-engine-metrics-and-statistics-calculator.ts`
- `src/backtest/backtest-engine-result-types.ts`
- `src/cli/arb-agi-auto-execution-commands.ts`
- `src/cli/arb-engine-orchestrator-commands.ts`
- `src/cli/arb-scan-run-commands.ts`
- `src/core/bot-engine-builtin-plugin-factories.ts`
- `src/core/bot-engine-config-and-state-types.ts`
- `src/core/bot-engine-trade-executor-and-position-manager.ts`
- `plans/260301-1901-security-audit/`
- `plans/260301-1920-deps-update-audit-fix/`

## .gitignore Status

✅ Already covers: `node_modules/`, `dist/`, `.env`, `.env.local`, `*.log`, `.DS_Store`, `.turbo/`

## Phases

| # | File | Status | Effort |
|---|------|--------|--------|
| 1 | [phase-01-verify-gitignore-and-stage.md](./phase-01-verify-gitignore-and-stage.md) | pending | 5m |
| 2 | [phase-02-commit-and-verify.md](./phase-02-commit-and-verify.md) | pending | 5m |

## Success Criteria

- `git status` shows clean working tree after commit
- No sensitive files (`.env`, `node_modules/`, secrets) committed
- Commit message follows conventional format
