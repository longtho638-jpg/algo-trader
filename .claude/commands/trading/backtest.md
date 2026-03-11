---
description: 📊 Backtest trading strategy against historical data
argument-hint: [strategy] [pair] [timeframe]
---

**Think** để backtest: <args>$ARGUMENTS</args>

## Context

CWD: `apps/algo-trader`

## Available Strategies

| Strategy | Type | Key |
|----------|------|-----|
| RSI+SMA | Trend | `RsiSmaStrategy` |
| RSI Crossover | Momentum | `RsiCrossoverStrategy` |
| Triangular Arb | Arbitrage | `TriangularArbitrage` |
| Statistical Arb | Mean-reversion | `StatisticalArbitrage` |
| Cross-Exchange Arb | Spread | `CrossExchangeArbitrage` |
| AGI Arb | Adaptive | `AgiArbitrage` |

## Commands

```bash
# Basic backtest (no API key needed)
cd apps/algo-trader && pnpm dev backtest

# Advanced backtest with equity curve
cd apps/algo-trader && pnpm dev backtest:advanced

# Walk-forward analysis (detect overfitting)
cd apps/algo-trader && pnpm dev backtest:walk-forward

# Compare all non-arb strategies
cd apps/algo-trader && pnpm dev compare
```

## Workflow

1. Parse strategy, pair, timeframe from args (defaults: RsiSma, BTC/USDT, 1h)
2. Run backtest command
3. Analyze output: win rate, Sharpe, max drawdown, Sortino, Calmar
4. Report results with recommendations
5. Suggest parameter tuning if Sharpe < 1.0
