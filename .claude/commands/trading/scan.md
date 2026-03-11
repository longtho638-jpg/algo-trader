---
description: 🔍 Market scan — technical analysis, regime detection, opportunity finder (like /scout for markets)
argument-hint: [pair] [timeframe] [exchanges]
---

**Think harder** để scan market: <args>$ARGUMENTS</args>

## Ánh xạ: /scout (scan codebase) → /trading:scan (scan markets)

Like `/scout` scans code for patterns, `/trading:scan` scans markets for trading opportunities.

## Context

CWD: `apps/algo-trader`
SDK: `@agencyos/trading-core` — Indicators (RSI, SMA, MACD, BBands, Z-Score)
Exchanges: Binance, OKX, Bybit via CCXT

## Scan Types

### 1. Technical Scan — Indicator snapshot
```bash
# Run indicator analysis across pairs
cd apps/algo-trader && pnpm dev arb:scan
```
- RSI (14): Overbought >70, Oversold <30
- SMA crossover: 20/50 golden/death cross
- MACD histogram: momentum direction
- BBands: squeeze/breakout detection

### 2. Regime Scan — Market state classification
Uses `src/execution/market-regime-detector.ts`:
- **Trending**: Hurst >0.55, clear directional movement
- **Mean-reverting**: Hurst <0.45, price oscillates around mean
- **Volatile**: High volatility ratio, wide BBands
- **Quiet**: Low volatility, narrow BBands

### 3. Spread Scan — Cross-exchange opportunities
```bash
cd apps/algo-trader && pnpm dev arb:spread --dry-run
```
Scans bid/ask spreads across Binance/OKX/Bybit

### 4. Correlation Scan — Pair correlations
Uses `Indicators.correlation()` to find:
- Highly correlated pairs (>0.85) for stat arb
- Decorrelated pairs for diversification

## Subagent Delegation

Spawn `researcher` agent to:
1. Fetch current prices via CCXT dry-run
2. Calculate indicators via `@agencyos/trading-core/analysis`
3. Classify market regime per pair
4. Rank opportunities by signal strength
5. Output scan report with actionable signals

## Output Format

```
## Market Scan — [date]
| Pair | Price | RSI | Regime | Signal | Strength |
|------|-------|-----|--------|--------|----------|
| BTC/USDT | $XX,XXX | XX | trending | BUY | 72% |
| ETH/USDT | $X,XXX | XX | ranging | HOLD | 45% |

### Spreads (>0.1%)
| Pair | Buy@Exchange | Sell@Exchange | Spread |
|------|-------------|--------------|--------|

### Recommendation
[Top 3 actionable signals with reasoning]
```
