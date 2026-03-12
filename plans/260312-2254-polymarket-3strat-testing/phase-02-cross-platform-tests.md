# Phase 02: CrossPlatformArbStrategy Tests

**Priority:** High | **Status:** Pending | **Agent:** tester

## Context Links
- Parent Plan: [./plan.md](./plan.md)
- Related: `tests/strategies/polymarket/ComplementaryArbStrategy.test.ts` (pattern)
- Source: `src/strategies/CrossPlatformArbStrategy.ts`

## Overview
Unit tests for CrossPlatformArbStrategy — Polymarket vs Kalshi arbitrage.

## Test Coverage

### Unit Tests
1. **Arb Detection Logic**
   - YES+NO < 1.00 detection
   - Fee-aware profit calculation
   - Stale data rejection (>5s)

2. **Cross-Exchange Pricing**
   - Polymarket YES, Kalshi NO
   - Kalshi YES, Polymarket NO
   - Same exchange rejection

3. **Signal Generation**
   - Paired BUY_YES + BUY_NO signals
   - Correct token IDs
   - Synchronized timestamps

4. **Edge Cases**
   - Zero prices
   - Extreme spreads
   - Missing orderbook data

5. **Fair Value Calculator**
   - Fee-adjusted prices
   - ArbEdge calculation
   - Confidence scaling

## Related Code Files (Exclusive)
- `tests/strategies/CrossPlatformArbStrategy.test.ts` — NEW
- `tests/analysis/CrossExchangeFairValue.test.ts` — NEW

## Implementation Steps
1. Read `ComplementaryArbStrategy.test.ts` for pattern
2. Create test files
3. Mock KalshiClient, PolymarketClient
4. Write 20+ test cases
5. Run: `pnpm test -- CrossPlatformArb`

## Todo List
- [ ] Setup test file structure
- [ ] Mock Kalshi + Polymarket clients
- [ ] Write arb detection tests
- [ ] Write signal tests
- [ ] Write fair value tests
- [ ] Verify all tests pass

## Success Criteria
- [ ] 20+ test cases
- [ ] All tests pass
- [ ] Coverage >80%
- [ ] No memory issues

## Next Steps
After completion: Phase 04 integration tests
