# Phase 04: Bot Engine Integration

**Priority:** High | **Status:** Pending | **Agent:** fullstack-developer

## Context Links
- Parent Plan: [./plan.md](./plan.md)
- Dependencies: Phase 01, 02, 03 must complete first
- Related: `src/polymarket/bot-engine.ts`, `src/polymarket/index.ts`

## Overview
Integrate all 3 new strategies into PolymarketBotEngine:
- ListingArbStrategy
- CrossPlatformArbStrategy
- MarketMakerStrategy

## Requirements
- Update `PolymarketBotEngine` to support new strategies
- Strategy configuration via JSON/env
- Multi-strategy orchestration (run parallel or selective)
- Proper lifecycle management (start/stop)

## Architecture

### Bot Engine Updates
```typescript
// src/polymarket/bot-engine.ts
class PolymarketBotEngine {
  // Existing strategies
  // New strategies:
  private listingArb: ListingArbStrategy;
  private crossPlatformArb: CrossPlatformArbStrategy;
  private marketMaker: MarketMakerStrategy;

  async startStrategy(name: string): Promise<void>;
  async stopStrategy(name: string): Promise<void>;
  async stopAll(): Promise<void>;
}
```

## Related Code Files (Exclusive to this phase)
- `src/polymarket/bot-engine.ts` — UPDATE
- `src/polymarket/index.ts` — UPDATE (exports)
- `src/config/polymarket-3strat-config.ts` — NEW (optional)

## Implementation Steps
1. Read existing `bot-engine.ts` for pattern
2. Add imports for 3 new strategies
3. Add strategy instances to engine
4. Add config loading for each strategy
5. Update exports in `index.ts`
6. Type-check: `pnpm run typecheck`

## Todo List
- [ ] Import new strategies
- [ ] Add to BotEngine class
- [ ] Config loading
- [ ] Update index.ts exports
- [ ] TypeScript compile pass

## Success Criteria
- [ ] All 3 strategies loadable by engine
- [ ] Config accepted via JSON
- [ ] Start/stop lifecycle works
- [ ] 0 TypeScript errors

## Conflict Prevention
- Only modifies `bot-engine.ts` (not touched by other phases)
- No strategy file modifications
- Integration only, implementation in Phase 01-03

## Risk Assessment
- **Import Cycles:** Careful with circular deps
- **Config Conflicts:** Namespace per-strategy
- **Memory:** Multiple strategies = more buffers

## Security Considerations
- Validate config values (no negative sizes)
- Rate limit across all strategies combined
- Circuit breaker on aggregate losses

## Next Steps
After completion: Phase 05 writes tests
