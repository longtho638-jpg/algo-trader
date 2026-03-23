# Live Trading Performance — We Eat Our Own Cooking

> **We trade every signal we publish with real capital.**
> No cherry-picking. Wins and losses both recorded. Data updated daily from live trading.

---

## Summary Stats

| Metric | Value |
|--------|-------|
| Total Trades | 0 |
| Win Rate | — |
| Total P&L (USDC) | — |
| Avg Edge (predicted) | — |
| Avg P&L per Trade | — |
| Max Drawdown | — |
| Period | 2026-03-24 → present |

*Paper trading in progress. Live trading begins once 50-trade paper baseline is complete.*

---

## Trade Log

| Date | Market | Direction | Entry Price | Exit Price | P&L (USDC) | Edge % | Status |
|------|--------|-----------|-------------|------------|------------|--------|--------|
| [PENDING] | — | — | — | — | — | — | paper trading in progress |
| [PENDING] | — | — | — | — | — | — | paper trading in progress |
| [PENDING] | — | — | — | — | — | — | paper trading in progress |
| [PENDING] | — | — | — | — | — | — | paper trading in progress |
| [PENDING] | — | — | — | — | — | — | paper trading in progress |

---

## Column Definitions

- **Market** — Polymarket question (truncated)
- **Direction** — `YES` or `NO` position taken
- **Entry Price** — CLOB fill price at trade open (0–1 scale)
- **Exit Price** — Resolution price (1.00 = correct, 0.00 = incorrect) or close price
- **P&L (USDC)** — Net profit/loss after gas + slippage
- **Edge %** — `|ourProb − marketProb|` at signal time

---

## Methodology

1. **Signal generation** — OpenClaw LLM estimates resolution probability independently
2. **Edge filter** — Only trade when `edge > 5%`
3. **Position sizing** — Half-Kelly, capped at 2% of bankroll per trade
4. **Risk controls** — Daily stop-loss at 10% drawdown; max 5 open positions simultaneously
5. **Recording** — All trades logged in SQLite; this file synced daily

---

## Disclaimer

Past performance does not guarantee future results. This is a public record of
algorithmic signal accuracy — not financial advice. All capital is our own and at risk.
