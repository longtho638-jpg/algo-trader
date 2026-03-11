---
title: "Git Cleanup & Commit"
status: pending
effort: 5m
---

# Phase 01: Git Cleanup & Commit

## Context
- Parent: [plan.md](./plan.md)
- Existing plan: `plans/260301-1931-git-cleanup-commit/` (superseded by this consolidated plan)

## Overview
Stage all algo-trader changes, verify .gitignore, commit modularization refactor.

## Pre-Verified
- `.gitignore` ✅ covers: `node_modules/`, `dist/`, `.env`, `.env.local`, `*.log`, `.DS_Store`, `.turbo/`

## Changes to Commit

**Modified (5):**
- `package.json` — dep version bumps
- `src/backtest/BacktestEngine.ts` — extracted metrics/stats calculator
- `src/cli/arb-cli-commands.ts` — extracted scan/run + orchestrator + AGI commands
- `src/core/BotEngine.ts` — extracted config/state types + trade executor
- `src/core/bot-engine-plugins.ts` — extracted builtin plugin factories

**New Files (8):**
- `src/backtest/backtest-engine-metrics-and-statistics-calculator.ts`
- `src/backtest/backtest-engine-result-types.ts`
- `src/cli/arb-agi-auto-execution-commands.ts`
- `src/cli/arb-engine-orchestrator-commands.ts`
- `src/cli/arb-scan-run-commands.ts`
- `src/core/bot-engine-builtin-plugin-factories.ts`
- `src/core/bot-engine-config-and-state-types.ts`
- `src/core/bot-engine-trade-executor-and-position-manager.ts`

**Plan dirs (3):**
- `plans/260301-1901-security-audit/`
- `plans/260301-1920-deps-update-audit-fix/`
- `plans/260301-1931-git-cleanup-commit/`

## Implementation Steps

1. Verify `.gitignore` covers sensitive paths (DONE ✅)
2. `git add` all algo-trader files (src/, package.json, plans/)
3. `git commit -m 'refactor(algo-trader): modularize BotEngine, BacktestEngine, CLI commands'`
4. Verify: `git status` shows clean tree for algo-trader paths

## Success Criteria
- [ ] No `.env`, `node_modules/`, or `dist/` files staged
- [ ] Commit created with conventional message
- [ ] `git status` clean for algo-trader paths
