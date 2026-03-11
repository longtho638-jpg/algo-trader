---
description: 🛡️ Risk assessment — position sizing, portfolio exposure, drawdown limits (unique to trading)
argument-hint: [check: portfolio|position|trade] [params]
---

**Think harder** để assess risk: <args>$ARGUMENTS</args>

## No Coder Equivalent — Unique to Trading

Risk management has no direct coder parallel. This is the trader's safety net.

## Context

SDK: `@agencyos/trading-core/core/risk-manager.ts`
Config: `.env` — `MAX_DAILY_LOSS`, `RISK_PER_TRADE`, `MAX_POSITION_SIZE`

## Risk Checks

### 1. Position Sizing
```typescript
import { RiskManager } from '@agencyos/trading-core';

// Risk 2% of $10,000 at $50,000 BTC
const size = RiskManager.calculatePositionSize(10000, 2, 50000);
// → 0.004 BTC ($200 at risk)
```

### 2. Stop-Loss / Take-Profit Validation
```typescript
const check = RiskManager.checkStopLossTakeProfit(
  currentPrice, entryPrice, side,
  { stopLossPercent: 5, takeProfitPercent: 10 }
);
```

### 3. Portfolio Exposure
- Total open positions vs portfolio value
- Per-exchange concentration
- Per-pair concentration
- Correlated exposure (BTC + ETH = ~80% correlated)

### 4. Drawdown Analysis
- Current drawdown from peak
- Max historical drawdown
- Recovery time estimation
- Kelly criterion optimal sizing

### 5. Daily Loss Limit
- Spent today vs `MAX_DAILY_LOSS`
- Remaining budget for day
- Auto-halt trigger status

## Risk Score Matrix

| Risk | Score | Action |
|------|-------|--------|
| Position >5% portfolio | 🔴 HIGH | Reduce or reject |
| Drawdown >10% | 🔴 HIGH | Halt trading |
| R:R <1:1.5 | 🟡 MEDIUM | Adjust targets |
| Correlated >60% | 🟡 MEDIUM | Diversify |
| All within limits | 🟢 LOW | Proceed |

## Output Format

```
## Risk Assessment — [date]
| Metric | Value | Limit | Status |
|--------|-------|-------|--------|
| Position size | $XXX | $X,XXX | ✅ |
| Portfolio exposure | XX% | 30% | ✅ |
| Daily P&L | -$XX | -$XXX | ✅ |
| Max drawdown | X.X% | 10% | ✅ |
| R:R ratio | 1:X.X | 1:1.5 | ✅ |

**Risk Score: LOW/MEDIUM/HIGH**
**Recommendation: PROCEED/CAUTION/HALT**
```
