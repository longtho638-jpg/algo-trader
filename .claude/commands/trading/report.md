---
description: 📊 Generate trading reports — P&L, performance, strategy comparison
argument-hint: [type: pnl|performance|strategy|html] [period]
---

**Think** để generate report: <args>$ARGUMENTS</args>

## Ánh xạ: /docs (documentation) → /trading:report (trading reports)

## Context

CWD: `apps/algo-trader`
Reporters: ConsoleReporter, HtmlReporter, PerformanceAnalyzer
Output: `apps/algo-trader/plans/reports/`

## Report Types

### pnl — Profit & Loss report
- Daily/weekly/monthly breakdown
- Fees analysis
- Net vs gross P&L
- Per-exchange breakdown

### performance — Strategy performance
- Sharpe, Sortino, Calmar ratios
- Win rate, profit factor
- Max drawdown, recovery time
- Equity curve data

### strategy — Strategy comparison
```bash
cd apps/algo-trader && pnpm dev compare
```
Side-by-side comparison of all strategies

### html — Full HTML report
```bash
cd apps/algo-trader && pnpm dev backtest:advanced
```
Interactive report with charts

## Workflow

1. Parse report type and period
2. Gather data from backtest/live results
3. Calculate metrics via PerformanceAnalyzer
4. Generate report in requested format
5. Save to `plans/reports/trading-report-[date].md`

## Output

Reports saved to: `apps/algo-trader/plans/reports/`
HTML reports: `apps/algo-trader/data/reports/`
