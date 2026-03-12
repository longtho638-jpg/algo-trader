# Phase 03: CrossPlatformArb + MarketMaker Strategies

**Priority:** High | **Status:** Complete | **Agent:** fullstack-developer

## Context Links
- Parent Plan: [./plan.md](./plan.md)
- Dependencies: Phase 01 (KalshiClient) recommended first
- Related: `src/strategies/polymarket/ComplementaryArbStrategy.ts`

## Overview
Implement 2 strategies:
1. **CrossPlatformArbStrategy:** Polymarket vs Kalshi price differences
2. **MarketMakerStrategy:** Two-sided orderbook liquidity, spread capture

## Requirements

### CrossPlatformArbStrategy
- Compare YES prices: Polymarket vs Kalshi same event
- Detect arb: Poly_YES + Kalshi_NO < 1.00 (or vice versa)
- Execute buy both sides for guaranteed profit
- Fee-aware calculation (Poly maker=0, Kalshi taker=0.07%)

### MarketMakerStrategy
- Place bid/ask around midprice (configurable spread)
- Auto-cancel/replace when midprice moves
- Capture spread + maker rebate (USDC daily)
- Inventory management (delta neutral target)

## Architecture

### CrossPlatformArbStrategy
```typescript
interface ArbOpportunity {
  eventId: string;
  buyMarket: 'POLY' | 'KALSHI';
  sellMarket: 'POLY' | 'KALSHI';
  buyTokenId: string;
  sellTokenId: string;
  edge: number;
  profitPerShare: number;
}
```

### MarketMakerStrategy
```typescript
interface MMConfig {
  targetSpread: number;    // 0.10 = 10¢
  orderSize: number;       // shares per side
  maxInventory: number;    // max delta
  cancelReplaceMs: number; // heartbeat
}
```

## Related Code Files (Exclusive to this phase)
- `src/strategies/CrossPlatformArbStrategy.ts` — NEW
- `src/strategies/MarketMakerStrategy.ts` — NEW
- `src/analysis/CrossExchangeFairValue.ts` — NEW

## Implementation Steps
1. Read existing `ComplementaryArbStrategy.ts` for pattern
2. Implement `CrossPlatformArbStrategy.ts` with Kalshi integration
3. Implement `MarketMakerStrategy.ts` with cancel/replace loop
4. Add `CrossExchangeFairValue.ts` for price normalization
5. Type-check: `pnpm run typecheck`

## Todo List
- [x] CrossPlatformArbStrategy implementation
- [x] MarketMakerStrategy implementation
- [x] Fair value calculator
- [x] Config schemas
- [x] TypeScript compile pass

## Success Criteria
- [x] CrossPlatformArb detects YES+NO < 1.00
- [x] MarketMaker places 2-sided orders
- [x] Fee-aware profit calculation
- [x] 0 TypeScript errors, 0 `any`

## Conflict Prevention
- Files exclusive to this phase
- Depends on Phase 01 KalshiClient interface only
- No modification of existing strategies

## Risk Assessment
- **Latency:** Prices stale >5s = skip
- **Execution Risk:** One leg fills, other doesn't
- **Kalshi API:** Different contract specs

## Security Considerations
- Validate event equivalence (same underlying)
- Check max exposure before execution
- Circuit breaker on losses

## Next Steps
After completion: Phase 04 integrates both strategies into BotEngine
