# Phase 4: BotEngine Integration

**Created:** 2026-03-11
**Priority:** P0
**Status:** ✅ Complete
**Owner:** Full-stack

---

## Context Links

- Parent Plan: [plan.md](./plan.md)
- Previous: [phase-03-safety-circuits.md](./phase-03-safety-circuits.md)
- Existing: `src/core/BotEngine.ts`

---

## Overview

Integrate AGI layer with existing BotEngine.

| Attribute | Value |
|-----------|-------|
| ETA | 2 hours |
| Priority | P0 |
| Status | ✅ Complete |

---

## Requirements

**Functional:**
- ✅ AGI signal enhancement (existing signals → LLM analysis)
- ✅ AGI risk assessment (LLM-based risk scoring)
- ✅ Decision injection into order pipeline
- ✅ Fallback to rules-based on LLM failure

**Non-Functional:**
- ✅ Zero downtime deployment
- ✅ Feature flag for AGI enable/disable
- ✅ Metrics for AGI vs rules performance

---

## Implementation Steps

1. ✅ Update `BotEngine.ts` to accept AGI decisions
2. ✅ Create AGI signal enhancer wrapper (AGIAdapter)
3. ✅ Add AGI risk scoring to RiskManager (via SOP engine)
4. ✅ Implement fallback logic (AGI fail → rules)
5. ✅ Add feature flag (env var)
6. ✅ Add metrics tracking (AGI win rate vs rules)
7. ⏸ Update CLI commands for AGI modes (deferred to Phase 5)

---

## Todo List

- [x] Update BotEngine.ts
- [x] Create AGI signal enhancer
- [x] Add AGI risk scoring
- [x] Implement fallback logic
- [x] Add feature flag
- [x] Add metrics tracking
- [ ] Update CLI commands (deferred)

---

## Success Criteria

```typescript
// Must work:
// 1. AGI mode enabled
process.env.AGI_ENABLED = 'true';

// 2. Signal with AGI enhancement
const signal = await botEngine.generateSignal('BTC/USDT');
// signal.agiDecision = { action: 'BUY', confidence: 0.78 }

// 3. Fallback on AGI failure
// AGI timeout → rules-based decision used instead
```

**Status:** ✅ All criteria met

---

## Related Files

- ✅ Update: `src/core/BotEngine.ts` (AGI integration complete)
- Create: `src/agi/integration/signal-enhancer.ts` (wrapped in AGIAdapter)
- Create: `src/agi/integration/risk-scorer.ts` (wrapped in SOP engine)
- Create: `src/agi/integration/fallback-handler.ts` (wrapped in AGIAdapter)
- ✅ Create: `src/agi/integration/agi-adapter.ts`
- ✅ Create: `src/agi/integration/agi-config.ts`
- ✅ Create: `src/agi/integration/agi.types.ts`
- ✅ Create: `src/agi/integration/index.ts`

---

## Code Changes Summary

**BotEngine.ts updates:**
- Imported `AGIAdapter` and `loadAGIConfig`
- Added `agiAdapter` private property
- Initialize AGIAdapter in constructor if `AGI_ENABLED=true`
- Enhanced `onSignalGenerated()` with AGI signal enhancement
- Fallback to original signal on AGI error
- Log AGI override decisions and confidence scores

---

## Next Steps

→ Proceed to [Phase 5: Testing](./phase-05-testing.md)
