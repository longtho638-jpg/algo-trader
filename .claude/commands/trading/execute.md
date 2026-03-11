---
description: ⚡ Execute trades — order routing, arb execution, live trading (like /cook for code)
argument-hint: [mode: live|arb:agi|arb:spread|arb:auto|paper] [options]
---

**Think harder** để execute: <args>$ARGUMENTS</args>

## Ánh xạ: /cook (implement feature) → /trading:execute (execute trades)

Like `/cook` implements a planned feature, `/trading:execute` executes a planned trade.

## Context

CWD: `apps/algo-trader`
Requires: `.env` with exchange API keys
Components: LiveExchangeManager, ExchangeRouter, ExchangeConnectionPool

## Execution Modes

### paper — Paper trading (safe, no real money)
```bash
cd apps/algo-trader && pnpm dev live --paper
```
Uses `PaperTradingArbitrageBridge` for simulated execution

### live — Single-exchange live trading
```bash
cd apps/algo-trader && pnpm dev live
```
⚠️ REAL MONEY — verify risk parameters first

### arb:agi — AGI arbitrage (recommended)
```bash
cd apps/algo-trader && pnpm dev arb:agi
```
Regime detection + Kelly sizing + self-tuning

### arb:spread — Cross-exchange spread detector
```bash
cd apps/algo-trader && pnpm dev arb:spread
```

### arb:auto — Unified auto-execution pipeline
```bash
cd apps/algo-trader && pnpm dev arb:auto
```

## Pre-execution Checklist (MANDATORY)

1. ✅ `/trading:plan` approved by user
2. ✅ `/trading:risk` check passed
3. ✅ `/trading:health` — all exchanges connected
4. ✅ `.env` API keys valid
5. ✅ Risk limits set: `MAX_DAILY_LOSS`, `MAX_POSITION_SIZE`
6. ✅ Circuit breaker configured

## Execution Components

```
User → /trading:plan → /trading:execute
         │                    │
         ▼                    ▼
    Risk Check         LiveExchangeManager.start()
         │                    │
         ▼                    ├── ExchangeConnectionPool
    Approval Gate             ├── WebSocketPriceFeedManager
         │                    ├── ExchangeRouter (fallback)
         ▼                    └── ExchangeHealthMonitor
    Execute Order
         │
         ▼
    /trading:monitor → /trading:report
```

## Safety Rules

- **NEVER** execute without `/trading:plan` first
- **ALWAYS** start with `--paper` or `--dry-run`
- **MAX** risk per trade: 2% of portfolio
- **CIRCUIT BREAKER**: auto-halt at daily loss limit
- Stealth execution via `PhantomOrderCloakingEngine` if enabled
