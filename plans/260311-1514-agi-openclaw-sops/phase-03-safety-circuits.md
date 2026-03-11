# Phase 3: Safety Circuits

**Created:** 2026-03-11
**Priority:** P0 (Critical)
**Status:** Pending
**Owner:** Backend

---

## Context Links

- Parent Plan: [plan.md](./plan.md)
- Related: [phase-02-sop-engine.md](./phase-02-sop-engine.md)

---

## Overview

Implement safety circuits and kill switches for AGI trading.

| Attribute | Value |
|-----------|-------|
| ETA | 2 hours |
| Priority | P0 (Critical) |
| Status | Pending |

---

## Requirements

**Functional:**
- Circuit breaker (3 consecutive failures → pause)
- Drawdown limit (5% max → stop trading)
- Latency check (>1s → reduce frequency)
- Confidence threshold (<0.6 → human review)
- Kill switch (immediate stop)

**Non-Functional:**
- Response time < 10ms
- State persistence (Redis)
- Alert on trigger

---

## Implementation Steps

1. Create `src/agi/safety/circuit-breaker.ts`
2. Implement failure counter (Redis-backed)
3. Implement drawdown tracker
4. Implement latency monitor
5. Create confidence gate
6. Add kill switch endpoint
7. Add Telegram alerts on trigger
8. Write unit tests

---

## Todo List

- [ ] Create circuit-breaker.ts
- [ ] Implement failure counter
- [ ] Implement drawdown tracker
- [ ] Implement latency monitor
- [ ] Create confidence gate
- [ ] Add kill switch
- [ ] Add alerts
- [ ] Write tests

---

## Success Criteria

```typescript
// Must work:
const breaker = new CircuitBreaker({ maxFailures: 3, timeout: 3600 });
breaker.recordFailure();
breaker.recordFailure();
breaker.recordFailure();
console.log(breaker.isOpen()); // true → trading paused

// Drawdown check
const guard = new DrawdownGuard({ maxDrawdown: 0.05 });
await guard.check(currentEquity, peakEquity); // Throws if > 5%
```

---

## Related Files

- Create: `src/agi/safety/circuit-breaker.ts`
- Create: `src/agi/safety/drawdown-guard.ts`
- Create: `src/agi/safety/latency-monitor.ts`
- Create: `src/agi/safety/confidence-gate.ts`
- Create: `src/agi/safety/kill-switch.ts`
- Update: `src/execution/telegram-trade-alert-bot.ts` (add alerts)

---

## Next Steps

→ Proceed to [Phase 4: Integration](./phase-04-integration.md)
