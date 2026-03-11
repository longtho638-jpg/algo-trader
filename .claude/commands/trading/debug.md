---
description: 🔧 Debug trading issues — strategy underperformance, execution errors, connectivity (like /debug for code)
argument-hint: [issue-description]
---

**Think harder** để debug trading issue: <args>$ARGUMENTS</args>

## Ánh xạ: /debug (debug code) → /trading:debug (debug trading)

## Common Issues & Diagnostic Flow

### 1. Strategy underperforming
```
Symptoms: Low win rate, poor Sharpe ratio
Diagnose:
  1. Run walk-forward: pnpm dev backtest:walk-forward
  2. Check regime alignment (strategy designed for trending but market ranging?)
  3. Compare parameters vs optimal (overfitting?)
  4. Check signal quality via SignalFilter scores
Fix: Adjust parameters, add regime filter, or switch strategy
```

### 2. Execution errors
```
Symptoms: Orders failing, partial fills, timeouts
Diagnose:
  1. Check /trading:health — exchange connectivity
  2. Review ExchangeRouter fallback logs
  3. Check rate limits (MAX_RPM per exchange)
  4. Verify API key permissions (trade enabled?)
Fix: Switch exchange, adjust rate limits, refresh API keys
```

### 3. Arbitrage not finding spreads
```
Symptoms: arb:scan shows 0 opportunities
Diagnose:
  1. Check WebSocket feeds: are ticks arriving?
  2. Compare manual prices vs feed prices
  3. Verify fee calculations (spread < fees = no opportunity)
  4. Check market regime (quiet markets = fewer spreads)
Fix: Lower threshold, add more pairs, wait for volatility
```

### 4. High slippage
```
Symptoms: Execution price >> expected price
Diagnose:
  1. Check orderbook depth via OrderBookDepthAnalyzer
  2. Review order size vs available liquidity
  3. Check latency to exchange
Fix: Use limit orders, reduce size, enable PhantomOrderCloaking
```

### 5. Connection issues
```
Symptoms: Disconnected, stale data
Diagnose:
  1. /trading:health — full connectivity check
  2. ExchangeHealthMonitor stale threshold
  3. WebSocket reconnect logs
Fix: LiveExchangeManager auto-recovery handles this
```

## Diagnostic Tools

| Tool | What It Checks |
|------|----------------|
| `/trading:health` | Exchange connectivity |
| `/trading:signal` | Signal quality |
| `/trading:review` | Performance metrics |
| `pnpm dev backtest:walk-forward` | Overfitting |
| `pnpm test` | Code correctness (1216 tests) |

## Subagent Delegation

Spawn `debugger` agent to:
1. Read logs in `apps/algo-trader/logs/`
2. Analyze error patterns
3. Run targeted tests
4. Propose fix
5. Verify fix with backtest
