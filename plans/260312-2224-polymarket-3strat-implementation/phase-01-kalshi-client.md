# Phase 01: Kalshi Client Implementation

**Priority:** High | **Status:** Pending | **Agent:** fullstack-developer

## Context Links
- Parent Plan: [./plan.md](./plan.md)
- Dependencies: None (can run in parallel with Phase 02, 03)
- Docs: [../../docs/system-architecture.md](../../docs/system-architecture.md)

## Overview
Implement Kalshi REST API client and WebSocket adapter for cross-platform arbitrage.

**Kalshi API:** https://kalshi.com/
- REST: `https://api.elections.kalshi.com/trade-api/v2`
- WebSocket: `wss://api.elections.kalshi.com/trade-api/ws/v2`
- Auth: RSA-PSS signature (JWT-style with private key)

## Requirements
- Kalshi REST client with RSA-PSS authentication
- Kalshi WebSocket client for orderbook + ticker streams
- Type-safe interfaces matching Polymarket types
- Rate limiting (100 req/s burst, 1000 req/min)

## Architecture

### KalshiClient (REST)
```typescript
// src/adapters/KalshiClient.ts
- getMarket(eventId: string): Promise<KalshiMarket>
- getOrderBook(marketId: string): Promise<OrderBook>
- getBalance(): Promise<Balance>
- createOrder(marketId, side, count, price): Promise<OrderResponse>
- cancelOrder(orderId: string): Promise<void>
- cancelAllOrders(): Promise<void>
```

### KalshiWebSocket
```typescript
// src/adapters/KalshiWebSocket.ts
- connect(): Promise<void>
- subscribe(marketIds: string[]): void
- unsubscribe(marketIds: string[]): void
- on('orderbook', handler)
- on('ticker', handler)
- disconnect(): void
```

## Related Code Files (Exclusive to this phase)
- `src/adapters/KalshiClient.ts` — NEW
- `src/adapters/KalshiWebSocket.ts` — NEW
- `src/interfaces/IKalshi.ts` — NEW

## Implementation Steps
1. Read `.ag_proxies/POLYMARKET_3STRAT_INSTRUCTIONS.md` for Kalshi auth details
2. Create `src/interfaces/IKalshi.ts` with type definitions
3. Implement `KalshiClient.ts` with RSA-PSS signing
4. Implement `KalshiWebSocket.ts` with connection management
5. Add retry logic with exponential backoff
6. Type-check: `pnpm run typecheck`

## Todo List
- [ ] Define IKalshi interfaces
- [ ] Implement KalshiClient REST
- [ ] Implement KalshiWebSocket
- [ ] Add error handling + retry
- [ ] Verify TypeScript compile

## Success Criteria
- [ ] KalshiClient compiles with 0 errors
- [ ] KalshiWebSocket connects successfully
- [ ] All methods properly typed
- [ ] No `any` types used

## Conflict Prevention
- Files exclusive to this phase
- No overlap with Phase 02, 03, 04
- Uses existing `src/adapters/` pattern

## Risk Assessment
- **RSA-PSS Auth:** Complex signing — use `crypto` module carefully
- **API Rate Limits:** Implement request queue with token bucket
- **WebSocket Reconnect:** Handle disconnects gracefully

## Security Considerations
- Private key from env var only (never hardcoded)
- PEM file path validated before read
- All API responses validated with Zod

## Next Steps
After completion: Phase 04 will integrate KalshiClient into CrossPlatformArbStrategy
