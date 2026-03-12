# Phase 05: Vitest Tests + Documentation

**Priority:** High | **Status:** Pending | **Agent:** tester + docs-manager

## Context Links
- Parent Plan: [./plan.md](./plan.md)
- Dependencies: Phase 01, 02, 03, 04 must complete first
- Related: `tests/strategies/polymarket/` directory

## Requirements
1. **Vitest Setup:** Update `package.json` test script
2. **Strategy Tests:** Unit tests for all 3 strategies
3. **Integration Tests:** BotEngine + strategies
4. **Documentation:** Update README + docs/

## Vitest Configuration

### package.json Update
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  },
  "devDependencies": {
    "vitest": "^1.0.0",
    "@vitest/coverage-v8": "^1.0.0"
  }
}
```

## Test Files to Create
- `tests/strategies/polymarket/ListingArbStrategy.test.ts`
- `tests/strategies/polymarket/CrossPlatformArbStrategy.test.ts`
- `tests/strategies/polymarket/MarketMakerStrategy.test.ts`
- `tests/adapters/KalshiClient.test.ts`
- `tests/adapters/BinanceAnnouncementWS.test.ts`
- `tests/polymarket/bot-engine-integration.test.ts`

## Test Coverage Requirements
- **Unit Tests:** 80%+ line coverage per strategy
- **Edge Cases:** Invalid configs, API errors, timeouts
- **Integration:** End-to-end signal → order flow

## Related Code Files (Exclusive to this phase)
- `vitest.config.ts` — NEW
- `tests/strategies/polymarket/*.test.ts` — NEW (3 files)
- `tests/adapters/*.test.ts` — NEW (2 files)
- `tests/polymarket/bot-engine-integration.test.ts` — NEW
- `docs/polymarket-3strat-guide.md` — NEW
- `README.md` — UPDATE (Polymarket section)

## Implementation Steps
1. Install vitest: `pnpm add -D vitest @vitest/coverage-v8`
2. Create `vitest.config.ts`
3. Update `package.json` test script
4. Write unit tests for each strategy
5. Write integration tests
6. Run tests: `pnpm test`
7. Fix failing tests
8. Update documentation

## Todo List
- [ ] Install vitest dependencies
- [ ] Create vitest.config.ts
- [ ] Update package.json
- [ ] Write 6 test files
- [ ] Run test suite
- [ ] Fix failures
- [ ] Update docs

## Success Criteria
- [ ] `pnpm test` passes 100%
- [ ] Coverage >80% for new code
- [ ] README updated with strategies
- [ ] 0 TypeScript errors

## Conflict Prevention
- Test files separate from source
- No modification of strategy code
- Documentation additive only

## Risk Assessment
- **Vitest Compat:** Ensure TS config works
- **Mock Complexity:** WS connections need careful mocking
- **Time Constraints:** Tests may take time to write

## Security Considerations
- No real API keys in tests
- Use mock data only
- Sanitize any logged data

## Next Steps
After completion: Final review, commit, git push
