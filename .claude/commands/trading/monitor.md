---
description: 👁️ Live monitoring — positions, P&L, exchange health, alerts (like /watzup for trading)
argument-hint: [view: all|positions|pnl|alerts]
---

**Think** để monitor: <args>$ARGUMENTS</args>

## Ánh xạ: /watzup (project status) → /trading:monitor (trading status)

## Context

CWD: `apps/algo-trader`
Dashboard: `http://localhost:5173`
API: `http://localhost:3001`
Telegram: `/trading:telegram`

## Monitor Views

### 1. Positions — Open positions across exchanges
```bash
cd apps/algo-trader && pnpm dev arb:scan
```

### 2. P&L — Real-time profit/loss tracking
Uses `src/execution/strategy-position-manager.ts`

### 3. Exchange Health — Connection status
Uses `LiveExchangeManager.getHealthDashboard()`

### 4. Alerts — Active alerts & circuit breaker status
Uses `AdaptiveCircuitBreakerPerExchange`

## Live Dashboard

```bash
# Start dashboard
cd apps/algo-trader && pnpm dashboard:dev

# Start API server (WebSocket P&L feed)
cd apps/algo-trader && pnpm api:serve
```

## Telegram Bot (Remote Monitoring)

```bash
cd apps/algo-trader && pnpm telegram
```
Commands: `/status`, `/positions`, `/pnl`, `/alerts`, `/stop`

## Output Format

```
## Trading Monitor — [timestamp]

### Positions
| Pair | Side | Entry | Current | P&L | Exchange |
|------|------|-------|---------|-----|----------|

### P&L Summary
| Period | Gross | Fees | Net |
|--------|-------|------|-----|
| Today | $XX | $X | $XX |
| Week | $XXX | $XX | $XXX |

### Exchange Health
| Exchange | Status | Latency | WS |
|----------|--------|---------|-----|
| Binance | ✅ | 12ms | ✅ |
| OKX | ✅ | 18ms | ✅ |

### Alerts
[Active alerts or "No active alerts"]
```
