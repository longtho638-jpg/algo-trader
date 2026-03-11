# Phase 05: Safety & Testing

## Context Links
- [Phase 01 - Scanner](./phase-01-arbitrage-scanner.md) -- ArbitrageProfitCalculator, ArbitrageScanner
- [Phase 02 - Executor](./phase-02-arbitrage-executor.md) -- ArbitrageExecutor, ArbitrageRiskManager
- [Phase 03 - Tom Hum Integration](./phase-03-tom-hum-integration.md) -- ArbitrageTaskDispatcher, CLI
- [Existing arb tests](../../src/strategies/Arbitrage.test.ts) -- current test patterns
- [jest.config.js](../../jest.config.js) -- Jest + ts-jest config

## Overview
- **Priority**: P1
- **Status**: pending
- **Description**: Comprehensive unit and integration tests for all new arbitrage modules. Emergency kill switch implementation. Backtest support for arbitrage strategies.

## Key Insights
- Existing tests use Jest + ts-jest, follow AAA pattern
- Exchange interactions MUST be mocked -- never hit real APIs in tests
- ArbitrageProfitCalculator is pure math -- easiest to test, highest coverage value
- ArbitrageRiskManager is stateful -- test state transitions (circuit breaker trip/reset)
- ArbitrageExecutor needs mock ExchangeClient -- test success, partial fill, rollback paths
- ArbitrageTaskDispatcher needs mock filesystem -- test file write, dedup, priority mapping

## Requirements

### Functional
- Unit tests for all 6 new modules (>90% branch coverage)
- Mock ExchangeClient that simulates price responses and order execution
- Integration test: scanner -> dispatcher -> task file creation
- Emergency kill switch: global flag that halts all arb activity
- Backtest harness: replay historical price data through scanner+executor

### Non-functional
- Tests run in < 30s total
- No network calls in tests (all mocked)
- No file system side effects (use tmp dirs or mock fs)

## Architecture

```
Test Files:
  src/arbitrage/__tests__/
    arbitrage-profit-calculator.test.ts    # Pure math, ~15 test cases
    arbitrage-risk-manager.test.ts         # State machine, ~12 test cases
    arbitrage-executor.test.ts             # Mock exchanges, ~10 test cases
    arbitrage-scanner.test.ts              # Mock fetch, ~8 test cases
    arbitrage-task-dispatcher.test.ts      # Mock fs, ~8 test cases
    arbitrage-kill-switch.test.ts          # Global halt, ~5 test cases

Mock Helpers:
  src/arbitrage/__tests__/helpers/
    mock-exchange-client.ts                # Configurable mock IExchange
```

## Related Code Files

### New Files
| File | Purpose | Lines |
|------|---------|-------|
| `src/arbitrage/arbitrage-kill-switch.ts` | Global emergency halt flag | ~40 |
| `src/arbitrage/__tests__/helpers/mock-exchange-client.ts` | Configurable mock exchange | ~80 |
| `src/arbitrage/__tests__/arbitrage-profit-calculator.test.ts` | Calculator unit tests | ~120 |
| `src/arbitrage/__tests__/arbitrage-risk-manager.test.ts` | Risk manager state tests | ~100 |
| `src/arbitrage/__tests__/arbitrage-executor.test.ts` | Executor with mocks | ~120 |
| `src/arbitrage/__tests__/arbitrage-scanner.test.ts` | Scanner with mocks | ~80 |
| `src/arbitrage/__tests__/arbitrage-task-dispatcher.test.ts` | Dispatcher file tests | ~80 |
| `src/arbitrage/__tests__/arbitrage-kill-switch.test.ts` | Kill switch tests | ~40 |

### Modified Files
| File | Change |
|------|--------|
| `src/arbitrage/arbitrage-scanner.ts` | Check kill switch before each scan cycle |
| `src/arbitrage/arbitrage-executor.ts` | Check kill switch before each execution |

## Implementation Steps

### Step 1: Create Emergency Kill Switch
File: `src/arbitrage/arbitrage-kill-switch.ts`

```typescript
import { logger } from '../utils/logger';

/**
 * Global kill switch for all arbitrage activity.
 * Singleton pattern -- any module can read/write.
 * When killed: scanner stops polling, executor rejects new trades.
 */
class ArbitrageKillSwitch {
  private _killed = false;
  private _reason?: string;
  private _killedAt?: number;

  kill(reason: string): void {
    this._killed = true;
    this._reason = reason;
    this._killedAt = Date.now();
    logger.warn(`[KILL SWITCH] Arbitrage HALTED: ${reason}`);
  }

  reset(): void {
    logger.info(`[KILL SWITCH] Arbitrage resumed (was: ${this._reason})`);
    this._killed = false;
    this._reason = undefined;
    this._killedAt = undefined;
  }

  get isKilled(): boolean { return this._killed; }
  get reason(): string | undefined { return this._reason; }
  get killedAt(): number | undefined { return this._killedAt; }
}

// Singleton export
export const killSwitch = new ArbitrageKillSwitch();
```

Wire into scanner and executor:
```typescript
// In ArbitrageScanner.scanOnce():
if (killSwitch.isKilled) {
  logger.warn(`[SCANNER] Skipping scan -- kill switch active: ${killSwitch.reason}`);
  return [];
}

// In ArbitrageExecutor.execute():
if (killSwitch.isKilled) {
  return { status: 'rejected', error: `Kill switch: ${killSwitch.reason}`, ... };
}
```

### Step 2: Create Mock Exchange Client
File: `src/arbitrage/__tests__/helpers/mock-exchange-client.ts`

```typescript
import { IExchange, IOrder, IBalance } from '../../../interfaces/IExchange';

export interface MockPriceConfig {
  [symbol: string]: number;  // symbol -> price
}

export interface MockBalanceConfig {
  [currency: string]: number;  // currency -> free balance
}

export class MockExchangeClient implements IExchange {
  name: string;
  private prices: MockPriceConfig;
  private balances: MockBalanceConfig;
  private orderIdCounter = 0;
  public executedOrders: IOrder[] = [];
  public shouldFailOnOrder = false;
  public orderDelay = 0; // ms

  constructor(name: string, prices: MockPriceConfig, balances: MockBalanceConfig) {
    this.name = name;
    this.prices = prices;
    this.balances = balances;
  }

  async connect(): Promise<void> { /* no-op */ }

  async fetchTicker(symbol: string): Promise<number> {
    const price = this.prices[symbol];
    if (price === undefined) throw new Error(`Unknown symbol: ${symbol}`);
    return price;
  }

  async createMarketOrder(symbol: string, side: 'buy' | 'sell', amount: number): Promise<IOrder> {
    if (this.shouldFailOnOrder) throw new Error('Mock order failure');
    if (this.orderDelay > 0) await new Promise(r => setTimeout(r, this.orderDelay));

    const price = this.prices[symbol] ?? 0;
    const order: IOrder = {
      id: `mock-${++this.orderIdCounter}`,
      symbol, side, amount, price,
      status: 'closed',
      timestamp: Date.now()
    };
    this.executedOrders.push(order);
    return order;
  }

  async fetchBalance(): Promise<Record<string, IBalance>> {
    const result: Record<string, IBalance> = {};
    for (const [currency, free] of Object.entries(this.balances)) {
      result[currency] = { currency, free, used: 0, total: free };
    }
    return result;
  }

  // Helpers for test control
  setPrice(symbol: string, price: number): void { this.prices[symbol] = price; }
  setBalance(currency: string, amount: number): void { this.balances[currency] = amount; }
}
```

### Step 3: ArbitrageProfitCalculator Tests
File: `src/arbitrage/__tests__/arbitrage-profit-calculator.test.ts`

Test cases:
```
describe('calculateSpread')
  - should return correct spread percentage for buy < sell
  - should return correct spread percentage for buy > sell
  - should return 0 for equal prices
  - should handle very small price differences

describe('calculateNetProfit')
  - should subtract buy fee, sell fee, slippage from spread
  - should return negative when fees exceed spread
  - should handle zero fees
  - should handle high slippage

describe('findOpportunities')
  - should find opportunity when spread exceeds min threshold
  - should return empty when all spreads below threshold
  - should compare all exchange pairs (N*(N-1)/2)
  - should sort results by netProfitPercent descending
  - should calculate estimatedProfitUsd correctly
  - should handle single exchange (no pairs possible)
  - should handle identical prices across exchanges
```

### Step 4: ArbitrageRiskManager Tests
File: `src/arbitrage/__tests__/arbitrage-risk-manager.test.ts`

Test cases:
```
describe('preCheck')
  - should allow trade within limits
  - should reject when circuit broken
  - should reject when position exceeds max size
  - should reject when daily loss exceeded
  - should reject when insufficient buy balance
  - should reject when insufficient sell balance
  - should reject when trade count exceeds max

describe('recordTrade')
  - should accumulate positive P&L
  - should accumulate negative P&L
  - should trip circuit breaker at loss threshold
  - should increment trade count

describe('resetDaily')
  - should reset P&L to 0
  - should reset trade count
  - should reset circuit breaker
```

### Step 5: ArbitrageExecutor Tests
File: `src/arbitrage/__tests__/arbitrage-executor.test.ts`

Test cases:
```
describe('execute')
  - should execute buy+sell simultaneously and return success
  - should return dry_run result when dryRun=true
  - should return rejected when risk preCheck fails
  - should handle partial fill (buy succeeds, sell fails) with rollback
  - should handle partial fill (sell succeeds, buy fails) with rollback
  - should handle both legs failing
  - should record trade in risk manager
  - should add orders to order manager
  - should return rejected when kill switch active

describe('rollback')
  - should sell back bought amount on partial fill
  - should buy back sold amount on partial fill
  - should log error if rollback also fails
```

### Step 6: ArbitrageScanner Tests
File: `src/arbitrage/__tests__/arbitrage-scanner.test.ts`

Test cases:
```
describe('start/stop')
  - should connect all exchanges on start
  - should clear interval on stop
  - should not scan when kill switch active

describe('scanOnce')
  - should fetch prices from all exchanges for each symbol
  - should emit opportunity events for profitable spreads
  - should handle exchange fetch errors gracefully (Promise.allSettled)
  - should emit scan-complete event with timing
```

### Step 7: ArbitrageTaskDispatcher Tests
File: `src/arbitrage/__tests__/arbitrage-task-dispatcher.test.ts`

Use `os.tmpdir()` for test file writes, clean up in afterEach.

Test cases:
```
describe('dispatch')
  - should write task file with correct priority prefix
  - should write atomic (tmp then rename)
  - should deduplicate within TTL
  - should allow dispatch after TTL expires
  - should map netProfit > 1% to CRITICAL_
  - should map netProfit > 0.5% to HIGH_
  - should map netProfit > 0.2% to MEDIUM_
  - should map netProfit <= 0.2% to LOW_
```

### Step 8: Kill Switch Tests
File: `src/arbitrage/__tests__/arbitrage-kill-switch.test.ts`

```
describe('killSwitch')
  - should default to not killed
  - should be killed after kill() call
  - should store reason and timestamp
  - should be reset after reset() call
  - should allow re-kill after reset
```

### Step 9: Backtest Support (lightweight)
Add to `src/index.ts` a `arb-backtest` command that replays historical price CSV through ArbitrageProfitCalculator:

```typescript
program
  .command('arb-backtest')
  .description('Backtest arbitrage on historical price data')
  .requiredOption('-f, --file <path>', 'CSV with columns: timestamp,exchange,symbol,price')
  .option('--min-profit <percent>', 'Min net profit %', '0.15')
  .action(async (options) => {
    // 1. Read CSV
    // 2. Group by timestamp
    // 3. For each timestamp group: run findOpportunities()
    // 4. Sum hypothetical P&L
    // 5. Print results (total trades, win rate, total profit)
  });
```

CSV format:
```csv
timestamp,exchange,symbol,price
1709136000,binance,BTC/USDT,67450.50
1709136000,bybit,BTC/USDT,67585.20
1709136000,okx,BTC/USDT,67460.00
1709136010,binance,BTC/USDT,67455.00
...
```

## Todo List
- [ ] Create `src/arbitrage/arbitrage-kill-switch.ts`
- [ ] Wire kill switch into scanner and executor
- [ ] Create `src/arbitrage/__tests__/helpers/mock-exchange-client.ts`
- [ ] Create `src/arbitrage/__tests__/arbitrage-profit-calculator.test.ts`
- [ ] Create `src/arbitrage/__tests__/arbitrage-risk-manager.test.ts`
- [ ] Create `src/arbitrage/__tests__/arbitrage-executor.test.ts`
- [ ] Create `src/arbitrage/__tests__/arbitrage-scanner.test.ts`
- [ ] Create `src/arbitrage/__tests__/arbitrage-task-dispatcher.test.ts`
- [ ] Create `src/arbitrage/__tests__/arbitrage-kill-switch.test.ts`
- [ ] Add `arb-backtest` CLI command
- [ ] Run full test suite: `npx jest --coverage`
- [ ] Verify `tsc --noEmit` passes with zero errors

## Success Criteria
- All new test files pass: `npx jest src/arbitrage`
- Branch coverage > 90% for profit calculator and risk manager
- Branch coverage > 80% for executor and scanner
- Kill switch halts scanner + executor in tests
- No real network calls during test run
- `tsc --noEmit` passes with zero errors and zero `any` types

## Risk Assessment
- **Flaky tests from timers**: Use `jest.useFakeTimers()` for scanner interval and backoff tests
- **Mock drift**: MockExchangeClient must match IExchange interface exactly -- TypeScript enforces this
- **Test speed**: All mocked, no I/O -- target < 30s total for arb test suite

## Security Considerations
- Mock credentials only in tests (never real API keys)
- Kill switch prevents runaway execution in production
- Dry-run default (config.ARBITRAGE_DRY_RUN=true) prevents accidental live trading

## Next Steps
- After all phases complete: end-to-end manual test on testnet (binance testnet, bybit testnet)
- Monitor first 24h of dry-run scanning for opportunity detection accuracy
- Gradually enable live execution with $10 position size, then scale
