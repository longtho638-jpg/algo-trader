# Phase 03: MarketMakerStrategy Tests

**Priority:** High | **Status:** Pending | **Agent:** tester

## Context Links
- Parent Plan: [./plan.md](./plan.md)
- Related: `tests/strategies/polymarket/MakerBotStrategy.test.ts` (pattern)
- Source: `src/strategies/MarketMakerStrategy.ts`

## Overview
Unit tests for MarketMakerStrategy — two-sided liquidity provision.

## Test Coverage

### Unit Tests
1. **Spread Calculation**
   - Target spread config
   - Bid/ask price calculation
   - Midprice tracking

2. **Order Placement**
   - Two-sided order signals
   - Correct sizes
   - Price alignment

3. **Inventory Management**
   - Delta tracking
   - Inventory skew logic
   - Max inventory enforcement

4. **Cancel/Replace Loop**
   - Heartbeat trigger
   - Order replacement logic
   - Midprice movement detection

5. **Edge Cases**
   - Zero inventory start
   - Full inventory stop
   - Rapid price changes

## Related Code Files (Exclusive)
- `tests/strategies/MarketMakerStrategy.test.ts` — NEW

## Implementation Steps
1. Read `MakerBotStrategy.test.ts` for pattern
2. Create test file
3. Mock PolymarketClient
4. Write 15-20 test cases
5. Run: `pnpm test -- MarketMakerStrategy`

## Todo List
- [ ] Setup test file structure
- [ ] Mock dependencies
- [ ] Write spread calculation tests
- [ ] Write inventory tests
- [ ] Write cancel/replace tests
- [ ] Verify all tests pass

## Success Criteria
- [ ] 15+ test cases
- [ ] All tests pass
- [ ] Coverage >80%

## Next Steps
After completion: Phase 04 integration tests
