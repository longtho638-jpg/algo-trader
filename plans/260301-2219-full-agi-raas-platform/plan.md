# Full AGI RaaS Platform — Parallel Plan

## Overview
Nâng cấp algo-trader thành production-grade AGI RaaS trading platform.
3 parallel workstreams: RaaS API + Paper Trading + Production Hardening.

## Current State
- 496 tests, 80%+ coverage, strict TS, Zod validation
- Tenant manager, circuit breaker, health server, WS, webhook HMAC
- Backtest engine (walk-forward, Monte Carlo), exchange router w/ fallback

## Dependency Graph
```
Phase 1 (parallel, no deps):
  ├── Phase 1A: RaaS REST API Gateway
  ├── Phase 1B: Paper Trading Engine
  └── Phase 1C: Persistent State + Alerting

Phase 2 (depends on Phase 1):
  └── Phase 2: Integration + Tests
```

## Phases

### Phase 1A: RaaS REST API Gateway [PARALLEL]
- **File:** `phase-1a-raas-api-gateway.md`
- **Scope:** REST endpoints for tenant CRUD, strategy management, trade execution
- **New files:** `src/core/raas-api-router.ts`, `src/core/raas-api-router.test.ts`
- **Priority:** HIGH

### Phase 1B: Paper Trading Engine [PARALLEL]
- **File:** `phase-1b-paper-trading-engine.md`
- **Scope:** Virtual balance engine, simulated order fills, P&L tracking
- **New files:** `src/core/paper-trading-engine.ts`, `src/core/paper-trading-engine.test.ts`
- **Priority:** HIGH

### Phase 1C: Persistent State + Alerting [PARALLEL]
- **File:** `phase-1c-persistent-state-alerting.md`
- **Scope:** JSON file persistence for tenant state, alert rules engine
- **New files:** `src/core/persistent-state-store.ts`, `src/core/alert-rules-engine.ts` + tests
- **Priority:** MEDIUM

### Phase 2: Integration + Tests [SEQUENTIAL]
- **File:** `phase-2-integration-tests.md`
- **Scope:** Wire all modules into BotEngine, integration tests
- **Priority:** HIGH

## Success Criteria
- [ ] All new modules have tests (≥80% coverage)
- [ ] TypeScript strict, 0 errors
- [ ] Full test suite passes (500+ tests)
- [ ] Build succeeds
