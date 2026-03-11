---
description: 📡 Signal analysis — multi-indicator consensus, quality scoring, regime alignment
argument-hint: [pair] [timeframe]
---

**Think harder** để analyze signals: <args>$ARGUMENTS</args>

## Ánh xạ: Linting/Type-check → Signal validation

Like linting catches code errors, signal analysis catches bad trades.

## Context

SDK: `@agencyos/trading-core/core`
- `SignalGenerator` — multi-strategy consensus
- `SignalFilter` — regime-aware quality scoring
- `Indicators` — RSI, SMA, MACD, BBands, Z-Score

## Signal Pipeline

```
Raw Data (OHLCV)
  │
  ▼
Indicators (RSI, SMA, MACD, BBands)
  │
  ▼
Strategy Signals (BUY/SELL/NONE per strategy)
  │
  ▼
SignalGenerator (weighted consensus, threshold 0.6)
  │
  ▼
SignalFilter (regime alignment, volume, momentum, confluence)
  │
  ▼
Quality Score (0-100, min 50 to pass)
  │
  ▼
Actionable Signal → /trading:plan → /trading:execute
```

## Signal Quality Dimensions

| Dimension | Weight | What It Measures |
|-----------|--------|------------------|
| Regime alignment | 30% | Signal matches market regime |
| Volume confirmation | 20% | Volume supports direction |
| Momentum score | 25% | RSI/MACD confirm trend |
| Confluence | 25% | Multiple indicators agree |

## Usage

```bash
# Analyze signals for a pair
cd apps/algo-trader && pnpm dev compare

# Walk-forward validation (detect overfitting)
cd apps/algo-trader && pnpm dev backtest:walk-forward
```

## Output Format

```
## Signal Analysis — [pair] [timeframe]
📊 Regime: trending (Hurst: 0.62)

| Indicator | Value | Signal | Weight |
|-----------|-------|--------|--------|
| RSI (14) | 35 | BUY | 0.3 |
| SMA 20/50 | golden cross | BUY | 0.3 |
| MACD | histogram > 0 | BUY | 0.2 |
| BBands | lower touch | BUY | 0.2 |

**Consensus: BUY (0.78 > 0.6 threshold)**
**Quality Score: 72/100 ✅ PASS**
**Regime Alignment: trending + momentum = ✅**

→ Next: `/trading:plan long [pair]`
```
