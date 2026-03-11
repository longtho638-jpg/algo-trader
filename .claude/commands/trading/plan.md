---
description: 📋 Trading plan — structured trade planning before execution (like /plan for code)
argument-hint: [direction] [pair] [thesis]
---

**Think harder** để plan trade: <args>$ARGUMENTS</args>

## Ánh xạ: /plan (plan implementation) → /trading:plan (plan trade)

Like `/plan` creates implementation plan before coding, `/trading:plan` creates trading plan before execution.

## Trading Plan Template

### 1. Market Analysis (như /scout → /plan)
- Current price & trend
- Market regime (trending/ranging/volatile/quiet)
- Key support/resistance levels
- Volume analysis

### 2. Trade Thesis
- Direction: Long / Short / Arb
- Entry trigger: What condition activates trade?
- Timeframe: Scalp (<1h) / Swing (1d-1w) / Position (>1w)
- Confidence: Low / Medium / High

### 3. Risk Parameters (Risk Manager Agent)
```typescript
// Position sizing from @agencyos/trading-core
const size = RiskManager.calculatePositionSize(balance, riskPercent, entryPrice);
```
- Entry price & size
- Stop-loss level & percentage
- Take-profit target(s)
- Risk:Reward ratio (minimum 1:2)
- Max portfolio exposure

### 4. Execution Plan (Execution Agent)
- Entry type: Market / Limit / Conditional
- Exchange selection (best liquidity/fees)
- Slippage tolerance
- Order splitting strategy (for large positions)

### 5. Exit Scenarios
| Scenario | Action | Trigger |
|----------|--------|---------|
| TP Hit | Close full | Price reaches target |
| SL Hit | Close full | Price hits stop |
| Trailing | Move SL up | New highs |
| Time exit | Review | 24h no movement |
| Invalidated | Close | Thesis broken |

### 6. Backtest Validation
```bash
# Validate thesis against historical data
cd apps/algo-trader && pnpm dev backtest
```

## Workflow

1. Parse direction, pair, thesis from args
2. Run `/trading:scan` for current market state
3. Build structured plan using template above
4. Calculate position size via RiskManager
5. Estimate risk:reward ratio
6. Validate against backtest if strategy-based
7. Output plan for user approval
8. On approval → pass to `/trading:execute`

## Output Format

```
## Trading Plan — [pair] [direction]
📊 Regime: [trending/ranging/volatile]
🎯 Entry: $XX,XXX (limit)
🛑 Stop: $XX,XXX (-X.X%)
✅ Target: $XX,XXX (+X.X%)
📐 R:R = 1:X.X
💰 Size: X.XXX [pair] ($X,XXX notional)
⚠️ Risk: $XXX (X% of portfolio)
```
