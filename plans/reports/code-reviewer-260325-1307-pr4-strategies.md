# Code Review: PR #4 Strategy Files

**Reviewer:** code-reviewer | **Date:** 2026-03-25
**Scope:** 4 strategy files + wiring + barrel exports | **LOC:** ~2,098

## Overall Assessment

Solid implementation. All 4 strategies follow established patterns consistently (tick factory, pure helpers exported for testing, config/deps interfaces). Zero `any` types. No secrets. Well-documented signal logic. Main concerns: DRY violations, files exceeding 200-line limit, and a few trading logic edge cases.

---

## Critical Issues

None found. No security vulnerabilities, no hardcoded secrets, no data exposure.

---

## High Priority

### H1. `bestBidAsk()` duplicated 12 times across strategies (DRY violation)

Identical function copy-pasted in every single strategy file. This is a maintenance risk.

**Fix:** Extract to shared utility:
```ts
// src/polymarket/orderbook-utils.ts
export function bestBidAsk(book: RawOrderBook): { bid: number; ask: number; mid: number } { ... }
```

**Affected files:** All 12 strategy files in `src/strategies/polymarket/`

### H2. Exit order size calculation may produce 0 quantity

**Files:** All 4 strategies
**Line pattern:** `size: String(Math.round(pos.sizeUsdc / currentPrice))`

When `currentPrice` is very close to 0 (e.g., 0.001), this produces very large quantities. When `currentPrice` approaches 1, `sizeUsdc / currentPrice` could round to a quantity smaller than the minimum order. `Math.round` can produce 0 if the raw value is < 0.5.

**Fix:** Add `Math.max(1, Math.round(...))` guard, or validate against exchange minimum order size.

### H3. Gamma scalping: partial fill on entry creates asymmetric position

**File:** `gamma-scalping.ts` L486-500

Two separate GTC orders placed sequentially for YES and NO. If YES fills but NO fails (or partially fills), the position is recorded with intended quantities, not actual fills. The position tracking assumes full fill.

**Fix:** Either:
- Use IOC + verify fill amounts before recording position
- Add fill verification after order placement
- Track intended vs actual quantities separately

### H4. Liquidation cascade: hardcoded `avgSpread = 0.04`

**File:** `liquidation-cascade.ts` L474

```ts
const avgSpread = 0.04; // typical spread baseline
```

Magic number. Not configurable. Will break on markets with different spread profiles.

**Fix:** Move to `LiquidationCascadeConfig` interface.

---

## Medium Priority

### M1. All 4 files exceed 200-line limit (modularization needed)

| File | Lines |
|------|-------|
| regime-adaptive-momentum.ts | 496 |
| liquidation-cascade.ts | 566 |
| order-flow-toxicity.ts | 472 |
| gamma-scalping.ts | 564 |

Per codebase rules, consider splitting each into:
- `{strategy}-helpers.ts` (pure functions, already exported for testing)
- `{strategy}-tick.ts` (tick factory, state management, entry/exit logic)
- `{strategy}-types.ts` (config interface, internal types)

### M2. TP/SL calculation duplicated across all 4 strategies

The entire `checkExits()` TP/SL block is nearly identical in regime-adaptive-momentum, liquidation-cascade, and order-flow-toxicity:
```ts
if (pos.side === 'yes') {
  const gain = (currentPrice - pos.entryPrice) / pos.entryPrice;
  // ... TP/SL checks
} else {
  const gain = (pos.entryPrice - currentPrice) / pos.entryPrice;
  // ... identical checks
}
```

**Fix:** Extract shared `calcGainPct(side, entryPrice, currentPrice)` and `checkTpSl(gain, tpPct, slPct)` utilities.

### M3. `detectCascade()` has O(n) duplicate iteration

**File:** `liquidation-cascade.ts` L101-200

Two separate for-loops over `inWindow` (one for down cascades, one for up). Could be a single pass detecting both directions simultaneously. Not a performance blocker at current tick volumes but worth noting.

### M4. Cooldown keyed on `tokenId` vs `conditionId` inconsistency

- regime-adaptive-momentum, liquidation-cascade, order-flow-toxicity: cooldown keyed on `tokenId`
- gamma-scalping: cooldown keyed on `conditionId`

This is probably intentional (gamma trades both YES+NO tokens per condition), but should be documented explicitly.

### M5. `detectRegime()` uses hardcoded thresholds (1.5, 2.0)

**File:** `regime-adaptive-momentum.ts` L133-135

Config exposes `trendThreshold` and `volatileAtrRatio` but `detectRegime()` ignores them, using hardcoded 1.5 and 2.0.

**Fix:** Pass config values to `detectRegime()`:
```ts
export function detectRegime(shortPrices, longPrices, trendThreshold, volatileRatio): Regime
```

---

## Low Priority

### L1. `classifyTick()` defaults flat price to 'buy'

**File:** `order-flow-toxicity.ts` L99

When `currentPrice === prevPrice`, defaults to `'buy'`. This introduces slight bullish bias in VPIN. Consider defaulting to the previous tick's side or splitting volume 50/50.

### L2. No `noTokenId` null check in some entry paths

**Files:** regime-adaptive-momentum L422, liquidation-cascade L485, order-flow-toxicity L402

Pattern `market.noTokenId ?? market.yesTokenId` — when `noTokenId` is missing and side is 'no', the strategy buys the YES token instead. This is logically wrong (buying YES when signal says NO). Should skip the market if noTokenId is missing and side is 'no'.

### L3. Event emission on entry assumes fill (no GTC fill guarantee)

All strategies emit `trade.executed` immediately after `placeOrder()` with GTC type. GTC orders may not fill immediately. The event should be emitted on confirmed fill, not on order placement.

### L4. `calcPullbackDepth` uses `Math.min(...prices)` with spread operator

**File:** `regime-adaptive-momentum.ts` L146

For very large `shortWindow` values, `Math.min(...prices)` can stack overflow. Not a risk at current shortWindow=10, but fragile.

---

## Wiring & Barrel Exports

**strategy-wiring.ts** - Correctly wired. All 4 new strategies:
- Properly imported
- Gated behind `clobClient && orderManager && gammaClient`
- Default `enabled: false` (safe)
- Unique env var keys for interval

**index.ts** - All 4 strategies exported with correct types. Consistent with existing pattern.

No issues found in wiring.

---

## Positive Observations

- Zero `any` types across all files
- Pure helper functions exported for testability
- Consistent factory pattern (`createXxxTick`)
- Comprehensive JSDoc headers explaining signal logic
- Config interfaces with sensible defaults
- All strategies default `enabled: false` in wiring
- StrategyName union type already updated in `core/types.ts`
- Proper error handling in tick functions (catch + continue)

---

## Recommended Actions (Priority Order)

1. **[H2]** Guard exit order size: `Math.max(1, Math.round(...))`
2. **[H3]** Add fill verification for gamma-scalping dual-leg entry
3. **[H4]** Move `avgSpread` to config
4. **[M5]** Pass config thresholds to `detectRegime()`
5. **[L2]** Skip market when `noTokenId` missing and side is 'no'
6. **[H1+M2]** Extract shared utilities (bestBidAsk, TP/SL calc) — recommend as follow-up PR
7. **[M1]** Modularize files >200 lines — recommend as follow-up PR

---

## Metrics

- Type Coverage: 100% (no `any`)
- Test Coverage: See tester report
- Linting Issues: 0 (no `any`, no `@ts-ignore`, no `console.log`)
- Security: No secrets, no env vars with sensitive defaults

---

## Unresolved Questions

1. Is `trade.executed` event supposed to represent order placement or confirmed fill? Current behavior emits on placement for GTC orders.
2. Should `detectRegime()` use config thresholds or are the hardcoded values intentional (frozen from paper trading validation)?
3. Gamma scalping assumes `noPrice = 1 - yesBid` — is this accurate enough for markets with wide NO-token spreads?
