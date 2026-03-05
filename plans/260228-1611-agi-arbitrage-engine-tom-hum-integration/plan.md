---
title: "AGI Arbitrage Engine -- Tom Hum Integration"
description: "Multi-exchange arbitrage scanner + executor with autonomous Tom Hum dispatch for 24/7 operation"
status: pending
priority: P1
effort: 12h
branch: master
tags: [arbitrage, ccxt, tom-hum, agi-loop, trading]
created: 2026-02-28
---

# AGI Arbitrage Engine -- Tom Hum Integration

## Overview

Rebuild the stub CrossExchangeArbitrage into a production-ready multi-exchange arbitrage system.
Integrate with Tom Hum daemon for autonomous 24/7 opportunity detection and execution.

## Architecture

```
ArbitrageScanner (TS)          Tom Hum Daemon (Node.js)
  |-- polls 3+ exchanges         |-- watches tasks/ dir
  |-- calculates net profit       |-- routes algo-trader tasks
  |-- writes task file -------->  |-- dispatches to CC CLI or executor
  |-- OR executes directly        |-- monitors health
```

## Phases

| # | Phase | Status | Effort | Files |
|---|-------|--------|--------|-------|
| 1 | [Arbitrage Scanner](./phase-01-arbitrage-scanner.md) | pending | 3h | 5 new, 1 update |
| 2 | [Arbitrage Executor](./phase-02-arbitrage-executor.md) | pending | 3h | 4 new, 2 update |
| 3 | [Tom Hum Integration](./phase-03-tom-hum-integration.md) | pending | 2.5h | 3 new, 2 update |
| 4 | [AGI Autonomous Loop](./phase-04-agi-autonomous-loop.md) | pending | 2h | 2 new, 1 update |
| 5 | [Safety & Testing](./phase-05-safety-and-testing.md) | pending | 1.5h | 6 new test files |

## Key Dependencies

- ccxt ^4.2.0 (already installed)
- Existing ExchangeClient, IStrategy, BotEngine patterns
- Tom Hum task-queue.js file watcher + mission-dispatcher.js routing
- `algo-trader` keyword already registered in openclaw-worker config

## New Directory Structure

```
src/arbitrage/
  arbitrage-config.ts          # Config interfaces + defaults
  arbitrage-scanner.ts         # Multi-exchange price polling
  arbitrage-profit-calculator.ts # Fee-aware net profit calc
  arbitrage-executor.ts        # Simultaneous buy/sell
  arbitrage-risk-manager.ts    # Circuit breaker, daily P&L
  arbitrage-task-dispatcher.ts # Tom Hum task file writer
src/interfaces/
  IArbitrageOpportunity.ts     # Opportunity data structure
```

## Constraints

- TypeScript strict, zero `any`
- Files < 200 lines
- kebab-case filenames
- Extend ExchangeClient, don't replace
- All business logic must have tests
- Dry-run mode mandatory before live
