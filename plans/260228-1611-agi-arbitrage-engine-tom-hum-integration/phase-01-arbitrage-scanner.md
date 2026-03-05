# Phase 01: Arbitrage Scanner

## Context Links
- [ExchangeClient](../../src/execution/ExchangeClient.ts) -- CCXT wrapper, single exchange
- [CrossExchangeArbitrage](../../src/strategies/CrossExchangeArbitrage.ts) -- current stub
- [IExchange](../../src/interfaces/IExchange.ts) -- exchange interface
- [ICandle](../../src/interfaces/ICandle.ts) -- candle + metadata types

## Overview
- **Priority**: P1
- **Status**: pending
- **Description**: Build multi-exchange price scanner that polls 3+ exchanges simultaneously, calculates fee-aware spreads, and emits arbitrage opportunities.

## Key Insights
- Current CrossExchangeArbitrage only reads `metadata.exchangeBPrice` from a single candle -- no real multi-exchange connection
- ExchangeClient wraps CCXT with `enableRateLimit: true` and 30s timeout -- reuse this
- CCXT `fetchTicker()` returns `last` price -- sufficient for spot arb scanning
- Exchange fees available via `ccxt.Exchange.fees` or `fetchTradingFee(symbol)`

## Requirements

### Functional
- Connect to N exchanges simultaneously (configurable, default 3: binance, bybit, okx)
- Poll ticker prices for configured symbols every N seconds (default 10s)
- Calculate net profit: `spread% - (feeExchangeA + feeExchangeB + slippageEstimate)`
- Emit `IArbitrageOpportunity` when net profit > threshold
- Support multiple symbol pairs scanning in parallel

### Non-functional
- Rate-limit compliant (CCXT `enableRateLimit` handles this)
- Graceful shutdown on SIGINT/SIGTERM
- Structured logging via existing winston logger

## Architecture

```
ArbitrageScanner
  |-- exchangeClients: Map<string, ExchangeClient>  (reuse existing class)
  |-- config: ArbitrageConfig
  |-- scanLoop():
  |     for each symbol:
  |       prices = await Promise.allSettled(exchanges.map(e => e.fetchTicker(symbol)))
  |       opportunities = ArbitrageProfitCalculator.findOpportunities(prices, fees)
  |       for each profitable opp: emit('opportunity', opp)
  |-- EventEmitter pattern for downstream consumers
```

## Related Code Files

### New Files
| File | Purpose | Lines |
|------|---------|-------|
| `src/interfaces/IArbitrageOpportunity.ts` | Opportunity data structure | ~40 |
| `src/arbitrage/arbitrage-config.ts` | Config interface + defaults | ~60 |
| `src/arbitrage/arbitrage-profit-calculator.ts` | Fee-aware profit math | ~80 |
| `src/arbitrage/arbitrage-scanner.ts` | Multi-exchange poller + emitter | ~120 |

### Modified Files
| File | Change |
|------|--------|
| `src/interfaces/IExchange.ts` | Add optional `fetchTradingFee(symbol): Promise<{maker:number, taker:number}>` |

## Implementation Steps

### Step 1: Create IArbitrageOpportunity interface
File: `src/interfaces/IArbitrageOpportunity.ts`

```typescript
export interface IArbitrageOpportunity {
  id: string;                    // uuid or timestamp-based
  symbol: string;                // e.g. 'BTC/USDT'
  buyExchange: string;           // e.g. 'binance'
  sellExchange: string;          // e.g. 'bybit'
  buyPrice: number;
  sellPrice: number;
  spreadPercent: number;         // raw spread before fees
  netProfitPercent: number;      // after fees + slippage
  estimatedProfitUsd: number;    // based on configured position size
  buyFee: number;                // taker fee on buy exchange
  sellFee: number;               // taker fee on sell exchange
  slippageEstimate: number;      // configurable default 0.05%
  timestamp: number;
  status: 'detected' | 'dispatched' | 'executed' | 'expired';
}

export interface IExchangePrice {
  exchange: string;
  symbol: string;
  price: number;
  timestamp: number;
}
```

### Step 2: Create ArbitrageConfig
File: `src/arbitrage/arbitrage-config.ts`

```typescript
export interface ArbitrageConfig {
  exchanges: ExchangeCredentials[];
  symbols: string[];                    // ['BTC/USDT', 'ETH/USDT']
  scanIntervalMs: number;              // default 10000 (10s)
  minNetProfitPercent: number;         // default 0.15 (0.15%)
  defaultSlippagePercent: number;      // default 0.05 (0.05%)
  maxPositionSizeUsd: number;          // default 100
  dryRun: boolean;                     // default true
  enableTaskDispatch: boolean;         // write task files for Tom Hum
  enableDirectExecution: boolean;      // execute trades directly
}

export interface ExchangeCredentials {
  id: string;         // ccxt exchange id
  apiKey?: string;
  secret?: string;
  takerFeeOverride?: number;  // override if known, else fetch from exchange
}
```
Load from `.env` + optional `config/arbitrage.yaml`.

### Step 3: Create ArbitrageProfitCalculator
File: `src/arbitrage/arbitrage-profit-calculator.ts`

Pure static methods, no side effects -- easy to unit test.

```typescript
export class ArbitrageProfitCalculator {
  static calculateSpread(buyPrice: number, sellPrice: number): number
  static calculateNetProfit(
    buyPrice: number, sellPrice: number,
    buyFee: number, sellFee: number,
    slippage: number
  ): number
  static findOpportunities(
    prices: IExchangePrice[],
    fees: Map<string, number>,
    config: Pick<ArbitrageConfig, 'minNetProfitPercent' | 'defaultSlippagePercent' | 'maxPositionSizeUsd'>
  ): IArbitrageOpportunity[]
}
```

Core formula:
```
netProfit% = ((sellPrice - buyPrice) / buyPrice * 100) - buyFee% - sellFee% - slippage%
```

`findOpportunities` iterates all exchange pairs (N*(N-1)/2), returns sorted by netProfitPercent desc.

### Step 4: Create ArbitrageScanner
File: `src/arbitrage/arbitrage-scanner.ts`

```typescript
export class ArbitrageScanner extends EventEmitter {
  private clients: Map<string, ExchangeClient>;
  private fees: Map<string, number>;
  private config: ArbitrageConfig;
  private timer: NodeJS.Timeout | null;
  private isScanning: boolean;

  constructor(config: ArbitrageConfig)
  async start(): Promise<void>       // connect all exchanges, start scan loop
  async stop(): Promise<void>        // clear timer, disconnect
  private async scanOnce(): Promise<IArbitrageOpportunity[]>
  private async fetchAllPrices(symbol: string): Promise<IExchangePrice[]>
  private async loadFees(): Promise<void>
}

// Events:
// 'opportunity' -> IArbitrageOpportunity
// 'scan-complete' -> { symbol, prices, duration }
// 'error' -> Error
```

### Step 5: Update IExchange interface
Add optional fee fetching method to `src/interfaces/IExchange.ts`:

```typescript
fetchTradingFee?(symbol: string): Promise<{ maker: number; taker: number }>;
```

Update ExchangeClient to implement it using `ccxt.Exchange.fetchTradingFee()`.

## Todo List
- [ ] Create `src/interfaces/IArbitrageOpportunity.ts`
- [ ] Create `src/arbitrage/arbitrage-config.ts`
- [ ] Create `src/arbitrage/arbitrage-profit-calculator.ts`
- [ ] Create `src/arbitrage/arbitrage-scanner.ts`
- [ ] Update `src/interfaces/IExchange.ts` with optional `fetchTradingFee`
- [ ] Update `src/execution/ExchangeClient.ts` to implement `fetchTradingFee`
- [ ] Write unit tests for ArbitrageProfitCalculator (phase-05)

## Success Criteria
- Scanner connects to 3 exchanges without errors
- Price polling completes within 5s per cycle
- Opportunities correctly detected when spread > configured threshold
- Zero `any` types, passes `tsc --noEmit`

## Risk Assessment
- **Exchange API rate limits**: Mitigated by CCXT `enableRateLimit` + configurable interval
- **Price staleness**: fetchTicker returns `last` which can be stale on low-volume pairs -- add timestamp check
- **API key leakage**: Load from `.env`, never log credentials

## Next Steps
- Phase 02 consumes `IArbitrageOpportunity` from scanner to execute trades
- Phase 03 writes task files from scanner events
