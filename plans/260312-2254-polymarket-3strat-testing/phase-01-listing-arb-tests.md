# Phase 01: ListingArbStrategy Tests

**Priority:** High | **Status:** Pending | **Agent:** tester

## Context Links
- Parent Plan: [./plan.md](./plan.md)
- Related: `tests/strategies/polymarket/MakerBotStrategy.test.ts` (pattern)
- Source: `src/strategies/ListingArbStrategy.ts`

## Overview
Unit tests for ListingArbStrategy using Jest framework.

## Test Coverage

### Unit Tests
1. **Constructor & Config**
   - Default config values
   - Custom config override
   - Invalid config rejection

2. **Listing Detection**
   - Valid listing event parsing
   - Invalid event filtering
   - Duplicate event handling

3. **Signal Generation**
   - BUY_YES signal on valid listing
   - No signal when market not found
   - No signal during cooldown

4. **Gamma API Lookup**
   - Market found → signal generated
   - Market not found → skipped
   - API error handling

5. **Edge Cases**
   - Empty coin name
   - Special characters
   - Rate limit handling

## Related Code Files (Exclusive)
- `tests/strategies/ListingArbStrategy.test.ts` — NEW

## Implementation Steps
1. Read existing `MakerBotStrategy.test.ts` for pattern
2. Create test file with describe blocks
3. Mock BinanceAnnouncementWS, PolymarketGammaClient
4. Write 15-20 test cases
5. Run: `pnpm test -- ListingArbStrategy`

## Todo List
- [ ] Setup test file structure
- [ ] Mock external dependencies
- [ ] Write constructor tests
- [ ] Write listing detection tests
- [ ] Write signal generation tests
- [ ] Write edge case tests
- [ ] Verify all tests pass

## Success Criteria
- [ ] 15+ test cases
- [ ] All tests pass
- [ ] Coverage >80%
- [ ] No memory issues

## Conflict Prevention
- Test file exclusive to this phase
- Mock only, no real API calls
- No source code modifications

## Next Steps
After completion: Phase 04 integration tests
