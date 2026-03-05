# Phase 03: Exchange Connection Resilience

## Context
- [Plan](plan.md) | [Research: Exchange Analysis](research/researcher-02-exchange-risk-engine.md)
- Depends on: Phase 02

## Overview
- **Priority:** P1
- **Status:** ⬜ Pending
- **Effort:** 2h
- **Mô tả:** Thêm retry logic, error handling cho ExchangeClient. Đảm bảo bot không hang khi exchange downtime.

## Key Insights
- ExchangeClient hiện tại: single-shot, no retry, no reconnection
- `fetchTicker` trả `0` khi `last` là null → silent data corruption
- `createMarketOrder` throw error nhưng BotEngine chỉ log, không retry
- CCXT đã có `enableRateLimit: true` → tốt
- 30s timeout đã set → tốt

## Requirements
1. **Retry logic** cho exchange API calls (max 3, exponential backoff)
2. **Better error handling** cho fetchTicker (throw thay vì return 0)
3. **Connection health check** method
4. **Graceful degradation**: Bot tạm dừng khi exchange unreachable, tự resume

## Related Code Files
- `src/execution/ExchangeClient.ts` — MODIFY: add retry + health check
- `src/core/BotEngine.ts` — MODIFY: handle exchange errors gracefully
- `src/execution/ExchangeClient.test.ts` — MODIFY: test retry/error scenarios

## Implementation Steps

1. Thêm private retry wrapper vào ExchangeClient:
   ```typescript
   private async withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
     for (let i = 0; i < maxRetries; i++) {
       try { return await fn(); }
       catch (e) {
         if (i === maxRetries - 1) throw e;
         await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
         logger.warn(`Retry ${i+1}/${maxRetries}...`);
       }
     }
     throw new Error('unreachable');
   }
   ```

2. Wrap `connect()`, `fetchTicker()`, `createMarketOrder()`, `fetchBalance()` with retry

3. Fix `fetchTicker` → throw nếu ticker.last null (thay vì return 0)

4. Thêm `isConnected()` health check method

5. Update BotEngine `onCandle` → catch exchange errors, tạm dừng + log

6. Viết tests cho retry logic (mock failures)

## Todo List
- [ ] Thêm withRetry() helper vào ExchangeClient
- [ ] Wrap tất cả API calls
- [ ] Fix fetchTicker null handling
- [ ] Thêm isConnected() method
- [ ] Update BotEngine error handling
- [ ] Viết retry tests
- [ ] `npx jest` → ALL PASS

## Success Criteria
- Exchange API calls retry 3 lần trước khi fail
- Bot không hang khi exchange downtime
- fetchTicker throw Error thay vì return 0
- Health check method available

## Risk Assessment
- Retry delay tích lũy: 1s + 2s + 4s = 7s max → acceptable
- Cần đảm bảo retry không gây duplicate orders (idempotent check)

## Security Considerations
- Retry không expose sensitive info trong logs
- Rate limit vẫn được CCXT quản lý
