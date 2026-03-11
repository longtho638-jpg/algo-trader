# Phase 01: Test Coverage — Core Modules

## Context
- [Plan](plan.md) | [Research: Coverage Audit](reports/researcher-01-test-coverage-security.md)

## Overview
- **Priority:** P0 — BLOCKING
- **Status:** ⬜ Pending
- **Effort:** 2h
- **Mô tả:** Viết tests cho các module core chưa có tests. Target: tất cả business logic phải covered.

## Key Insights
- 80 tests hiện tại ALL PASS — không phá vỡ gì
- 23 files source chưa có test nào
- Core modules cần test NGAY: OrderManager, StrategyLoader, ExchangeClient
- Strategies chưa test riêng: BollingerBand, MacdCrossover, RsiCrossover, RsiSma, Triangular, CrossExchange

## Requirements

### P0 — Must Have
1. **OrderManager tests**: addOrder, getOrders, getOpenOrders, getLastOrder
2. **StrategyLoader tests**: load valid strategy, load invalid → error
3. **ExchangeClient tests**: constructor validation, connect, fetchTicker, createMarketOrder, fetchBalance (mocked CCXT)
4. **ConfigLoader tests**: load YAML, env override, missing file error

### P1 — Should Have
5. **Strategy tests cho untested strategies**: BollingerBand, MacdCrossover, RsiCrossover, RsiSma
6. **BacktestRunner tests**: run with mock data, performance calculation
7. **MockDataProvider tests**: init, start, stop, subscribe

## Related Code Files

### Files cần tạo tests:
- `src/core/OrderManager.test.ts` — NEW
- `src/core/StrategyLoader.test.ts` — NEW
- `src/execution/ExchangeClient.test.ts` — NEW
- `src/utils/config.test.ts` — NEW
- `src/strategies/BollingerBandStrategy.test.ts` — NEW (hoặc extend Strategies.test.ts)
- `src/data/MockDataProvider.test.ts` — NEW
- `src/backtest/BacktestRunner.test.ts` — NEW

### Files source reference:
- `src/core/OrderManager.ts` (24 lines)
- `src/core/StrategyLoader.ts`
- `src/execution/ExchangeClient.ts` (80 lines)
- `src/utils/config.ts` (41 lines)

## Implementation Steps

1. Tạo `src/core/OrderManager.test.ts`
   - Test addOrder với valid IOrder
   - Test getOrders returns all
   - Test getOpenOrders filters by status='open'
   - Test getLastOrder returns last element

2. Tạo `src/core/StrategyLoader.test.ts`
   - Đọc StrategyLoader.ts trước
   - Test load('RsiSma') → returns instance
   - Test load('InvalidStrategy') → throws Error

3. Tạo `src/execution/ExchangeClient.test.ts`
   - Mock ccxt exchange class
   - Test constructor invalid exchangeId → throws
   - Test connect → loadMarkets called
   - Test fetchTicker → returns last price
   - Test createMarketOrder → maps response to IOrder
   - Test fetchBalance → maps to Record<string, IBalance>

4. Tạo `src/utils/config.test.ts`
   - Test load() reads YAML correctly
   - Test env var override cho apiKey/secret
   - Test load nonexistent file → throws

5. Chạy `npx jest --verbose` → verify ALL PASS

## Todo List
- [ ] OrderManager.test.ts
- [ ] StrategyLoader.test.ts
- [ ] ExchangeClient.test.ts
- [ ] config.test.ts
- [ ] Strategy tests cho BollingerBand, MacdCrossover, RsiCrossover, RsiSma
- [ ] MockDataProvider.test.ts
- [ ] BacktestRunner.test.ts
- [ ] `npx jest` → ALL PASS

## Success Criteria
- Tất cả test files mới PASS
- Total test count tăng đáng kể (target: 120+ tests)
- 0 test failures
- Core business logic modules: 100% coverage

## Risk Assessment
- **Jest config path mapping** — có thể cần update `moduleNameMapper`
- **CCXT mocking** — complex types, cần careful type casting

## Security Considerations
- Tests KHÔNG chứa real API keys
- Sử dụng mock/fake data cho tất cả exchange tests
