---
description: 📈 Trading Agent Ecosystem — full trader workflow parallel to ClaudeKit coder workflow
argument-hint: [task]
---

**Think harder** để thực hiện trading task: <task>$ARGUMENTS</task>

## Trading Agent Ecosystem — Deep ClaudeKit Mapping

```
┌─────────────────────────────────────────────────────────────┐
│           ClaudeKit Coder          →  Trading Trader        │
├─────────────────────────────────────────────────────────────┤
│ /scout (scan codebase)             → /trading:scan          │
│ /plan  (plan implementation)       → /trading:plan          │
│ /cook  (implement feature)         → /trading:execute       │
│ /debug (debug issues)              → /trading:debug         │
│ /review (code review)              → /trading:review        │
│ /test  (run tests)                 → /trading:backtest      │
│ /watzup (project status)           → /trading:monitor       │
│                                    → /trading:risk          │
│                                    → /trading:signal        │
│                                    → /trading:report        │
├─────────────────────────────────────────────────────────────┤
│ Infrastructure                                              │
│ /trading:arb       — Arbitrage operations                   │
│ /trading:strategy  — Strategy CRUD                          │
│ /trading:health    — Exchange connectivity                  │
│ /trading:dashboard — UI dashboard                           │
│ /trading:deploy    — Docker/PM2 deployment                  │
└─────────────────────────────────────────────────────────────┘
```

## Subagent Mapping

| Agent | Role | Coder Equivalent |
|-------|------|------------------|
| Market Analyst | Technical analysis, regime detection, signal quality | `Explore` agent |
| Risk Manager | Position sizing, exposure, drawdown limits | `code-reviewer` |
| Execution Agent | Order routing, exchange management, slippage | `fullstack-developer` |
| Strategy Agent | Strategy dev, backtest, optimization | `planner` + `tester` |
| Intelligence Agent | News, sentiment, on-chain data | `researcher` |

## Quick Command Map

| Task | Command |
|------|---------|
| Scan market | `/trading:scan BTC/USDT` |
| Plan trade | `/trading:plan long BTC breakout` |
| Execute | `/trading:execute arb:agi` |
| Backtest | `/trading:backtest RSI+SMA BTC/USDT 1h` |
| Risk check | `/trading:risk portfolio` |
| Signal analysis | `/trading:signal BTC/USDT` |
| Monitor live | `/trading:monitor` |
| Review P&L | `/trading:review daily` |
| Report | `/trading:report weekly` |
| Debug strategy | `/trading:debug RsiSma low-winrate` |
| Arb scan | `/trading:arb scan` |
| Health | `/trading:health` |
| Strategy | `/trading:strategy list` |
| Dashboard | `/trading:dashboard dev` |
| Deploy | `/trading:deploy docker` |

## Context

Project: `apps/algo-trader`
SDK: `packages/trading-core` (IStrategy, RiskManager, SignalGenerator, Indicators)
Tech: TypeScript, CCXT, TensorFlow.js, Fastify, BullMQ, Prisma, WebSocket
Tests: 1216 passing (102 suites)

## Workflow Routing

1. Parse arguments → identify task type
2. Route to appropriate `/trading:*` subcommand
3. If unclear → ask user to select operation
4. All operations within `apps/algo-trader/` context
5. Use `@agencyos/trading-core` SDK for all trading logic
