# Planner Report: AGI Arbitrage Engine -- Tom Hum Integration

**Date**: 2026-02-28
**Plan**: `plans/260228-1611-agi-arbitrage-engine-tom-hum-integration/`
**Effort**: ~12h across 5 phases

## Summary

Created comprehensive 5-phase implementation plan for a production-ready multi-exchange arbitrage engine integrated with Tom Hum autonomous daemon.

## Codebase Analysis

### Existing Assets (Reused)
- `ExchangeClient` -- CCXT wrapper with rate limiting, 30s timeout. Extend with `fetchTradingFee()`
- `IStrategy`, `ISignal`, `ICandle` -- well-defined interfaces, arbitrage strategies already follow pattern
- `CrossExchangeArbitrage` -- stub only reads `metadata.exchangeBPrice`, no real multi-exchange. Will be superseded by new `ArbitrageScanner`
- `OrderManager` -- simple order tracking, extended with `addArbTrade()`
- `RiskManager` -- single-exchange position sizing. New `ArbitrageRiskManager` handles multi-exchange + circuit breaker
- Tom Hum `config.js` -- `algo-trader` already registered in PROJECTS array and keyword routing
- Tom Hum `task-queue.js` -- TASK_PATTERN regex already matches our proposed filenames

### Architecture Decision: Scanner as Separate Process
- Scanner spawned as child process by Tom Hum, NOT embedded in Node.js daemon
- Reason: loose coupling, independent restarts, algo-trader remains self-contained TypeScript project
- Communication: task files (file IPC) -- proven pattern already used by Tom Hum

### Architecture Decision: Direct CLI Execution
- `arb-execute --opportunity '{json}'` command enables both Tom Hum dispatch AND manual execution
- Avoids CC CLI prompt injection overhead for time-sensitive arb trades
- Tom Hum dispatches direct Node.js command, not `/cook` wrapper

## Phase Breakdown

| Phase | New Files | Modified | Key Complexity |
|-------|-----------|----------|----------------|
| 01 Scanner | 4 | 2 | Multi-exchange polling, fee calculation |
| 02 Executor | 3 | 1 | Simultaneous orders, partial fill rollback |
| 03 Tom Hum | 1 | 2 | Task file format, CLI commands, dedup |
| 04 AGI Loop | 1 | 2 | Child process management, crash recovery |
| 05 Safety | 8 test + 1 | 2 | Kill switch, ~58 test cases, backtest CLI |

**Total**: 18 new files, 9 modified files, ~58 test cases

## New Module Map

```
src/arbitrage/
  arbitrage-config.ts              -- Config interfaces + defaults
  arbitrage-profit-calculator.ts   -- Pure math: spread, fees, net profit
  arbitrage-scanner.ts             -- EventEmitter, multi-exchange polling
  arbitrage-executor.ts            -- Simultaneous buy+sell, rollback
  arbitrage-risk-manager.ts        -- Circuit breaker, daily P&L
  arbitrage-trade-result.ts        -- Result type + helpers
  arbitrage-task-dispatcher.ts     -- Tom Hum task file writer
  arbitrage-kill-switch.ts         -- Global emergency halt
  __tests__/
    helpers/mock-exchange-client.ts
    arbitrage-profit-calculator.test.ts
    arbitrage-risk-manager.test.ts
    arbitrage-executor.test.ts
    arbitrage-scanner.test.ts
    arbitrage-task-dispatcher.test.ts
    arbitrage-kill-switch.test.ts

src/interfaces/
  IArbitrageOpportunity.ts         -- Opportunity data structure

apps/openclaw-worker/lib/
  arbitrage-watcher.js             -- Managed child process for scanner
```

## Safety Layers (Defense in Depth)

1. **Dry-run default** -- ARBITRAGE_DRY_RUN=true in config, must explicitly enable live
2. **Max position size** -- $100 USD cap per trade
3. **Daily loss circuit breaker** -- Trips at configurable threshold (default $500)
4. **Kill switch** -- Global halt, checked before every scan + execution
5. **Max trades/day** -- 50 default
6. **Deduplication** -- 30s TTL prevents duplicate task dispatch
7. **Restart circuit breaker** -- Max 10 scanner restarts/hour in Tom Hum watcher
8. **Rate limiting** -- CCXT `enableRateLimit` + configurable scan interval

## Unresolved Questions

1. **Testnet first?** Plan assumes dry-run mode first, then testnet, then live. Need exchange testnet API keys configured in `.env`
2. **Withdrawal/rebalancing**: When funds accumulate on one exchange, manual rebalancing needed. Auto-rebalancing is out of scope (YAGNI) but may be needed later
3. **WebSocket vs polling**: Current plan uses REST polling (10s interval). WebSocket would reduce latency to <100ms but adds complexity. Deferring to v2
4. **Existing CrossExchangeArbitrage.ts**: Keep or remove? Plan supersedes it with ArbitrageScanner. Recommend deprecating but not deleting (backward compat with StrategyLoader)
5. **Order book depth**: Current plan uses `fetchTicker()` (last price). For larger positions, should use `fetchOrderBook()` to check liquidity. Deferred to v2
