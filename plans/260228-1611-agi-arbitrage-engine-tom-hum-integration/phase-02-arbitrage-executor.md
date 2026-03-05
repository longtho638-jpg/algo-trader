# Phase 02: Arbitrage Executor

## Context Links
- [Phase 01 - Scanner](./phase-01-arbitrage-scanner.md) -- produces IArbitrageOpportunity
- [ExchangeClient](../../src/execution/ExchangeClient.ts) -- CCXT wrapper
- [RiskManager](../../src/core/RiskManager.ts) -- position sizing + trailing stops
- [OrderManager](../../src/core/OrderManager.ts) -- order tracking
- [IExchange](../../src/interfaces/IExchange.ts) -- IOrder, IBalance types

## Overview
- **Priority**: P1
- **Status**: pending
- **Description**: Execute arbitrage trades by placing simultaneous buy+sell orders across two exchanges. Includes dedicated risk manager with circuit breaker and daily P&L tracking.

## Key Insights
- Arbitrage execution MUST be near-simultaneous -- use `Promise.allSettled` for buy+sell
- Unlike directional trading (BotEngine), arb has NO open position state -- each trade is atomic buy+sell pair
- Existing RiskManager handles single-exchange position sizing; arb needs multi-exchange balance checking
- Slippage risk: market orders can slip significantly on thin order books -- use maxPositionSizeUsd to cap exposure
- Partial fills: one leg fills, other doesn't -- need rollback logic (sell what was bought)

## Requirements

### Functional
- Execute simultaneous market buy on cheap exchange + market sell on expensive exchange
- Track P&L per trade and cumulative daily P&L
- Dry-run mode: log trades with simulated fills, no real orders
- Circuit breaker: stop after configurable daily loss threshold
- Balance pre-check: verify sufficient funds on BOTH exchanges before execution
- Rollback on partial execution: if one leg fails, reverse the other

### Non-functional
- Execution latency < 2s for both legs
- Atomic logging: log both legs as single trade event
- Thread-safe: prevent concurrent execution of same opportunity

## Architecture

```
ArbitrageExecutor
  |-- clients: Map<string, ExchangeClient>  (shared with Scanner)
  |-- riskManager: ArbitrageRiskManager
  |-- orderManager: OrderManager            (reuse existing)
  |
  |-- execute(opportunity: IArbitrageOpportunity): Promise<ArbitrageTradeResult>
  |     1. riskManager.preCheck(opportunity)  -- balance + daily limit
  |     2. Promise.allSettled([buyOrder, sellOrder])
  |     3. Handle partial fills / rollback
  |     4. riskManager.recordTrade(result)
  |     5. Return ArbitrageTradeResult

ArbitrageRiskManager
  |-- dailyPnl: number
  |-- tradeCount: number
  |-- maxDailyLossUsd: number
  |-- maxPositionSizeUsd: number
  |-- isCircuitBroken: boolean
  |
  |-- preCheck(opp): boolean
  |-- recordTrade(result): void
  |-- resetDaily(): void      -- called at UTC midnight
  |-- getStatus(): RiskStatus
```

## Related Code Files

### New Files
| File | Purpose | Lines |
|------|---------|-------|
| `src/arbitrage/arbitrage-executor.ts` | Simultaneous buy/sell execution | ~130 |
| `src/arbitrage/arbitrage-risk-manager.ts` | Circuit breaker + daily P&L | ~120 |
| `src/arbitrage/arbitrage-trade-result.ts` | Trade result type + helpers | ~50 |

### Modified Files
| File | Change |
|------|--------|
| `src/core/OrderManager.ts` | Add `addArbTrade(buyOrder, sellOrder)` method |
| `src/interfaces/IExchange.ts` | Already updated in Phase 01 |

## Implementation Steps

### Step 1: Create ArbitrageTradeResult type
File: `src/arbitrage/arbitrage-trade-result.ts`

```typescript
import { IOrder } from '../interfaces/IExchange';
import { IArbitrageOpportunity } from '../interfaces/IArbitrageOpportunity';

export type ArbTradeStatus = 'success' | 'partial_fill' | 'failed' | 'dry_run' | 'rejected';

export interface ArbitrageTradeResult {
  opportunity: IArbitrageOpportunity;
  status: ArbTradeStatus;
  buyOrder: IOrder | null;
  sellOrder: IOrder | null;
  actualBuyPrice: number;
  actualSellPrice: number;
  actualProfitUsd: number;
  actualProfitPercent: number;
  executionTimeMs: number;
  error?: string;
  timestamp: number;
}

export function calculateActualProfit(
  buyOrder: IOrder | null,
  sellOrder: IOrder | null
): { profitUsd: number; profitPercent: number } {
  if (!buyOrder || !sellOrder) return { profitUsd: 0, profitPercent: 0 };
  const cost = buyOrder.amount * buyOrder.price;
  const revenue = sellOrder.amount * sellOrder.price;
  const profitUsd = revenue - cost;
  const profitPercent = cost > 0 ? (profitUsd / cost) * 100 : 0;
  return { profitUsd, profitPercent };
}
```

### Step 2: Create ArbitrageRiskManager
File: `src/arbitrage/arbitrage-risk-manager.ts`

```typescript
export interface ArbRiskConfig {
  maxPositionSizeUsd: number;    // default 100
  maxDailyLossUsd: number;       // default 500
  maxTradesPerDay: number;       // default 50
  minBalanceUsd: number;         // stop if balance < this
}

export interface RiskStatus {
  dailyPnlUsd: number;
  tradeCount: number;
  isCircuitBroken: boolean;
  reason?: string;
}

export class ArbitrageRiskManager {
  private config: ArbRiskConfig;
  private dailyPnlUsd = 0;
  private tradeCount = 0;
  private _isCircuitBroken = false;
  private circuitReason?: string;

  constructor(config: ArbRiskConfig)

  // Pre-execution checks
  preCheck(
    positionSizeUsd: number,
    buyExchangeBalance: number,
    sellExchangeBalance: number,
    sellAmount: number
  ): { allowed: boolean; reason?: string }
  // -- checks: circuit not broken, positionSize <= max, daily loss not exceeded,
  //            sufficient balance on both sides, trade count < max

  // Post-execution recording
  recordTrade(profitUsd: number): void
  // -- updates dailyPnlUsd, tradeCount
  // -- if dailyPnlUsd < -maxDailyLossUsd: trip circuit breaker

  resetDaily(): void     // Reset at UTC midnight
  getStatus(): RiskStatus
  get isCircuitBroken(): boolean
}
```

### Step 3: Create ArbitrageExecutor
File: `src/arbitrage/arbitrage-executor.ts`

```typescript
export class ArbitrageExecutor {
  private clients: Map<string, ExchangeClient>;
  private riskManager: ArbitrageRiskManager;
  private orderManager: OrderManager;
  private dryRun: boolean;

  constructor(
    clients: Map<string, ExchangeClient>,
    riskManager: ArbitrageRiskManager,
    orderManager: OrderManager,
    dryRun: boolean
  )

  async execute(opp: IArbitrageOpportunity): Promise<ArbitrageTradeResult> {
    // 1. Calculate position size (min of maxPositionSizeUsd and available balance)
    // 2. Pre-check via riskManager
    // 3. If dryRun: return simulated result
    // 4. Execute both legs via Promise.allSettled
    // 5. Handle outcomes:
    //    - Both fulfilled: success
    //    - One fulfilled, one rejected: partial_fill -> attempt rollback
    //    - Both rejected: failed
    // 6. Record trade in riskManager
    // 7. Add orders to orderManager
    // 8. Return ArbitrageTradeResult
  }

  private async rollback(
    exchange: string, symbol: string,
    side: 'buy' | 'sell', amount: number
  ): Promise<IOrder | null>
  // Reverse a partial fill: if bought, sell back. If sold, buy back.

  private simulateDryRun(opp: IArbitrageOpportunity): ArbitrageTradeResult
  // Return realistic mock result using opportunity prices
}
```

### Step 4: Update OrderManager
Add to `src/core/OrderManager.ts`:

```typescript
addArbTrade(buyOrder: IOrder, sellOrder: IOrder): void {
  this.orders.push(buyOrder, sellOrder);
  logger.info(
    `[OrderManager] Arb trade: BUY ${buyOrder.amount} @ ${buyOrder.price} on ${buyOrder.symbol} | ` +
    `SELL ${sellOrder.amount} @ ${sellOrder.price}`
  );
}
```

## Todo List
- [ ] Create `src/arbitrage/arbitrage-trade-result.ts`
- [ ] Create `src/arbitrage/arbitrage-risk-manager.ts`
- [ ] Create `src/arbitrage/arbitrage-executor.ts`
- [ ] Update `src/core/OrderManager.ts` with `addArbTrade`
- [ ] Write unit tests for ArbitrageRiskManager (phase-05)
- [ ] Write unit tests for ArbitrageExecutor with mock exchanges (phase-05)

## Success Criteria
- Dry-run execution logs realistic trade results
- Circuit breaker trips correctly at daily loss threshold
- Partial fill rollback executes reverse trade
- Zero `any` types, passes `tsc --noEmit`

## Risk Assessment
- **Partial fills**: One leg fills, other fails. Rollback logic attempts reverse but may also fail -- log and alert, cap via maxPositionSizeUsd ($100 default limits downside)
- **Execution latency**: Market can move during 200-500ms execution window. Slippage estimate (0.05%) accounts for this
- **Exchange downtime**: `Promise.allSettled` gracefully handles one exchange being down

## Security Considerations
- API keys with TRADE permission only (no withdrawal)
- Rate-limited to respect exchange ToS
- All trade results logged for audit trail
- maxPositionSizeUsd hard cap prevents runaway losses

## Next Steps
- Phase 03 wires scanner events to Tom Hum task files
- Phase 05 adds comprehensive tests for executor
