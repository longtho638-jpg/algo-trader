# Phase 04: BotEngine Integration Tests

**Priority:** High | **Status:** Pending | **Agent:** tester-lead

## Context Links
- Parent Plan: [./plan.md](./plan.md)
- Dependencies: Phase 01, 02, 03 must complete
- Related: `tests/core/BotEnginePlugins.test.ts` (pattern)
- Source: `src/polymarket/bot-engine.ts`

## Overview
Integration tests for PolymarketBotEngine with all 9 strategies.

## Test Coverage

### Integration Tests
1. **Strategy Loading**
   - All 9 strategies initialize
   - Config loading per strategy
   - Strategy registration

2. **Lifecycle Management**
   - startStrategy() → running
   - stopStrategy() → stopped
   - stopAll() → all stopped

3. **Multi-Strategy Orchestration**
   - Parallel strategy execution
   - No cross-contamination
   - Independent signals

4. **Event Routing**
   - Price ticks routed correctly
   - Strategy-specific events
   - Signal aggregation

5. **Edge Cases**
   - Start unknown strategy
   - Double start prevention
   - Graceful shutdown

## Related Code Files (Exclusive)
- `tests/polymarket/bot-engine-integration.test.ts` — NEW

## Implementation Steps
1. Read `BotEnginePlugins.test.ts` for pattern
2. Create integration test file
3. Mock all 9 strategies
4. Write 10-15 integration tests
5. Run: `pnpm test -- bot-engine-integration`

## Todo List
- [ ] Setup test file structure
- [ ] Mock PolymarketBotEngine
- [ ] Write strategy loading tests
- [ ] Write lifecycle tests
- [ ] Write orchestration tests
- [ ] Verify all tests pass

## Success Criteria
- [ ] 10+ integration tests
- [ ] All tests pass
- [ ] No memory issues
- [ ] Documents all 9 strategies

## Final Report
After Phase 04 complete:
- Run full test suite: `pnpm test`
- Generate coverage: `pnpm test:coverage`
- Report results
