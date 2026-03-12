# Phase 02: Binance Listing Detection + ListingArbStrategy

**Priority:** High | **Status:** Pending | **Agent:** fullstack-developer

## Context Links
- Parent Plan: [./plan.md](./plan.md)
- Dependencies: None (can run in parallel with Phase 01, 03)
- Related: `src/polymarket/gamma.ts` for market discovery

## Overview
1. Binance CMS WebSocket for real-time listing announcements
2. ListingArbStrategy: Buy YES on Polymarket when new token listed on Binance

**Thesis:** Binance listings = immediate price pumps. Polymarket markets lag by 30-120s.

## Requirements
- Binance CMS WebSocket connection
- REST polling fallback (60s interval)
- Listing detection regex/parsing
- ListingArbStrategy with configurable params

## Architecture

### BinanceAnnouncementWS
```typescript
// src/adapters/BinanceAnnouncementWS.ts
- connect(): Promise<void>
- on('listing', handler: (coin: string, time: number) => void)
- disconnect(): void
```

### ListingArbStrategy
```typescript
// src/strategies/ListingArbStrategy.ts
- calculateFairValue(tokenId): Promise<number>
- generateSignal(listingEvent): IPolymarketSignal
- onCandle(candle): Promise<ISignal>
```

## Related Code Files (Exclusive to this phase)
- `src/adapters/BinanceAnnouncementWS.ts` — NEW
- `src/strategies/ListingArbStrategy.ts` — NEW
- `src/interfaces/IBinance.ts` — NEW

## Implementation Steps
1. Read `POLYMARKET_3STRAT_INSTRUCTIONS.md` for Binance endpoints
2. Create `IBinance.ts` interfaces
3. Implement `BinanceAnnouncementWS.ts` with CMS parsing
4. Implement `ListingArbStrategy.ts` with signal generation
5. Add Gamma API lookup for token-to-condition mapping
6. Type-check: `pnpm run typecheck`

## Todo List
- [ ] Define IBinance interfaces
- [ ] Implement BinanceAnnouncementWS
- [ ] Implement ListingArbStrategy
- [ ] Add market lookup (Gamma API)
- [ ] Verify TypeScript compile

## Success Criteria
- [ ] Binance WS connects and parses listings
- [ ] Strategy generates BUY_YES signals
- [ ] Configurable thresholds (min volume, time window)
- [ ] 0 TypeScript errors

## Conflict Prevention
- No shared files with other phases
- Uses existing `src/strategies/` pattern
- Follows `BasePolymarketStrategy` interface

## Risk Assessment
- **Binance Rate Limits:** REST polling max 1/5s
- **False Positives:** Filter by announcement type
- **Latency:** WS preferred over REST

## Security Considerations
- API key optional for public CMS endpoint
- Validate announcement signatures if available

## Next Steps
After completion: Phase 04 integrates into BotEngine
