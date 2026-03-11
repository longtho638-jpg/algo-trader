---
description: 📝 Trade review — P&L analysis, win rate, strategy performance (like /review for code)
argument-hint: [period: daily|weekly|monthly|trade-id]
---

**Think harder** để review: <args>$ARGUMENTS</args>

## Ánh xạ: /review (code review) → /trading:review (trade review)

Like code review catches bugs, trade review catches strategy flaws.

## Context

CWD: `apps/algo-trader`
Reports: `src/reporting/` — ConsoleReporter, HtmlReporter, PerformanceAnalyzer

## Review Dimensions

### 1. Performance Metrics
| Metric | Target | Formula |
|--------|--------|---------|
| Win Rate | >55% | wins / total trades |
| Sharpe Ratio | >1.0 | (return - rf) / std |
| Sortino Ratio | >1.5 | (return - rf) / downside_std |
| Max Drawdown | <10% | peak-to-trough decline |
| Calmar Ratio | >2.0 | annual_return / max_drawdown |
| Profit Factor | >1.5 | gross_profit / gross_loss |

### 2. Trade Analysis
- Best/worst trade
- Average hold time
- Average R:R achieved vs planned
- Slippage analysis
- Fee impact

### 3. Strategy Breakdown
- Performance per strategy
- Performance per pair
- Performance per regime
- Performance per time-of-day

### 4. Risk Review
- Were stop-losses respected?
- Position sizing discipline
- Daily loss limit breaches
- Correlated loss events

## Commands

```bash
# Generate HTML report
cd apps/algo-trader && pnpm dev backtest:advanced

# Walk-forward analysis
cd apps/algo-trader && pnpm dev backtest:walk-forward
```

## Workflow

1. Gather trade history for period
2. Calculate performance metrics
3. Analyze strategy-level breakdown
4. Identify patterns (time-of-day, regime)
5. Risk discipline check
6. Recommendations for improvement

## Output Format

```
## Trade Review — [period]

### Summary
| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Trades | XX | - | - |
| Win Rate | XX% | >55% | ✅/❌ |
| Sharpe | X.XX | >1.0 | ✅/❌ |
| Max DD | X.X% | <10% | ✅/❌ |
| Net P&L | $X,XXX | - | - |

### Issues Found
[List issues like code review findings]

### Recommendations
[Actionable improvements]
```
