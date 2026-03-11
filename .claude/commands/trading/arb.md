---
description: 🔄 Cross-exchange arbitrage operations (scan, run, agi, spread)
argument-hint: [mode: scan|run|agi|spread|auto] [options]
---

**Think** để chạy arbitrage: <args>$ARGUMENTS</args>

## Context

CWD: `apps/algo-trader`
Requires: API keys for 2+ exchanges (BINANCE_API_KEY, OKX_API_KEY, BYBIT_API_KEY)

## Modes

| Mode | Command | Risk | API Keys |
|------|---------|------|----------|
| `scan` | `pnpm dev arb:scan` | None (dry-run) | Optional |
| `spread` | `pnpm dev arb:spread` | Low (auto-exec) | Required |
| `auto` | `pnpm dev arb:auto` | Medium | Required |
| `agi` | `pnpm dev arb:agi` | Medium (recommended) | Required |
| `run` | `pnpm dev arb:run` | High (live) | Required |

## AGI Features (Recommended)

- **Regime Detection** — Hurst exponent + volatility ratio
- **Kelly Sizing** — Optimal position size from win rate
- **Self-Tuning** — Thresholds auto-adjust via EMA
- **Strategy Routing** — Parameters adapt per market regime

## Key Parameters

```bash
# Safe start (dry-run scan)
pnpm dev arb:scan

# AGI with custom config
pnpm dev arb:agi -p BTC/USDT,ETH/USDT -e binance,okx,bybit -s 1000 --max-loss 100

# Spread detector with limited polls
pnpm dev arb:spread --dry-run --max-polls 100
```

## Workflow

1. Check `.env` for exchange API keys
2. Parse mode + options
3. Validate exchange connectivity
4. Run selected arb mode
5. Monitor output (spreads, signals, executions)
6. Report P&L summary
