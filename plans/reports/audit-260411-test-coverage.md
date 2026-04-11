# Test Coverage Audit Report — CashClaw (AlgoTrader)
**Date:** 2026-04-11
**Project:** algo-trader
**Audit Scope:** 6 target modules (messaging, intelligence, arbitrage, execution, feeds, billing)

---

## Test Execution Summary

| Metric | Result |
|--------|--------|
| Total Test Files | 44 |
| Total Tests Run | 570 |
| Tests Passed | 570 (100%) |
| Tests Failed | 0 |
| Test Duration | 6.74s |
| Build Status | ✅ PASS |

**Verdict:** All tests passing. No blocking issues detected.

---

## Target Modules Coverage Analysis

### High-Level Summary
| Module | Source Files | Test Files | Coverage % | Status |
|--------|--------------|-----------|-----------|--------|
| `messaging/` | 7 | 2 | 28.6% | ⚠️ LOW |
| `intelligence/` | 14 | 2 | 14.3% | 🔴 CRITICAL |
| `arbitrage/` | 23 | 7 | 30.4% | ⚠️ LOW |
| `execution/` | 13 | 4 | 30.8% | ⚠️ LOW |
| `feeds/` | 15 | 1 | 6.7% | 🔴 CRITICAL |
| `billing/` | 13 | 4 | 30.8% | ⚠️ LOW |
| **TOTAL** | **85** | **20** | **23.5%** | 🔴 CRITICAL |

**Current Gap:** 65 untested source files across 6 modules. Coverage well below project target of 80%+.

---

## Detailed Module Analysis

### 1. MESSAGING (28.6% coverage) — 5 untested files

**Tested (2/7):**
- ✅ `create-message-bus.ts`
- ✅ `topic-schema.ts`

**Untested (5/7):**
- `jetstream-manager.ts` — **HIGH PRIORITY** (message infrastructure)
- `nats-connection-manager.ts` — **HIGH PRIORITY** (connection management)
- `message-bus-interface.ts` — LOW PRIORITY (interface definition)
- `nats-message-bus.ts` — LOW PRIORITY (NATS implementation)
- `redis-message-bus.ts` — LOW PRIORITY (Redis implementation)

**Risk Assessment:** Medium. Message bus is core infrastructure but abstracted well. Critical handlers (NATS/JetStream managers) lack integration tests.

---

### 2. INTELLIGENCE (14.3% coverage) — 12 untested files

**Tested (2/14):**
- ✅ `relationship-graph-builder.ts`
- ✅ `semantic-cache.ts`

**Untested (12/14):**
- `market-context-builder.ts` — **HIGH PRIORITY** (context building logic)
- `alphaear-client.ts` — LOW PRIORITY (external API client)
- `dual-level-reflection-engine.ts` — LOW PRIORITY (reflection logic)
- `kronos-fair-value.ts` — LOW PRIORITY (pricing calculation)
- `logical-hedge-discovery.ts` — LOW PRIORITY (strategy discovery)
- `resolution-criteria-analyzer.ts` — LOW PRIORITY (criteria analysis)
- `semantic-dependency-discovery.ts` — LOW PRIORITY (dependency analysis)
- `semantic-similarity-search.ts` — LOW PRIORITY (similarity matching)
- `signal-consensus-swarm.ts` — LOW PRIORITY (signal consensus)
- `signal-fusion-engine.ts` — LOW PRIORITY (signal fusion)
- `signal-validator.ts` — LOW PRIORITY (signal validation)
- `vector-embedding-store.ts` — LOW PRIORITY (embedding storage)

**Risk Assessment:** HIGH. This module is critical for trading signal generation but almost entirely untested (86% gap). Most files are algorithmic/AI-focused and need unit tests.

---

### 3. ARBITRAGE (30.4% coverage) — 16 untested files

**Tested (7/23):**
- ✅ `arbitrage.test.ts` (core arbitrage logic)
- ✅ `backtester.ts`
- ✅ `executor.ts`
- ✅ `ilp-constraint-builder.ts`
- ✅ `integer-programming-solver.ts`
- ✅ `opportunity-detector.ts`
- ✅ `scanner.ts`

**Untested (16/23):**
- `binary-arbitrage-executor.ts` — **HIGH PRIORITY** (core executor)
- `binary-opportunity-detector.ts` — **HIGH PRIORITY** (opportunity detection)
- `cross-market-arbitrage-detector.ts` — **HIGH PRIORITY** (market detection)
- `cross-platform-arb-detector.ts` — **HIGH PRIORITY** (platform detection)
- `neg-risk-arb-scanner.ts` — **HIGH PRIORITY** (risk scanning)
- `regime-detector.ts` — **HIGH PRIORITY** (regime detection)
- `split-merge-arb-executor.ts` — **HIGH PRIORITY** (execution)
- `spread-detector.ts` — **HIGH PRIORITY** (spread detection)
- `config.ts` — MEDIUM PRIORITY (configuration)
- `compliance-rules.ts` — LOW PRIORITY (compliance logic)
- `compliance-types.ts` — LOW PRIORITY (type definitions)
- `governance-proposer.ts` — LOW PRIORITY (governance)
- `multi-leg-basket.ts` — LOW PRIORITY (basket logic)
- `self-evolving-ilp-constraints.ts` — LOW PRIORITY (constraint evolution)
- `settlement-listener.ts` — LOW PRIORITY (settlement handling)
- `signal-scorer.ts` — LOW PRIORITY (signal scoring)
- `trading-loop.ts` — LOW PRIORITY (loop logic)

**Risk Assessment:** HIGH. Core arbitrage engines (binary executor, detectors, scanners) lack test coverage. 8 HIGH-priority files untested.

---

### 4. EXECUTION (30.8% coverage) — 9 untested files

**Tested (4/13):**
- ✅ `distributed-nonce-manager.test.ts`
- ✅ `execution.test.ts`
- ✅ `gas-batch-optimizer.test.ts`
- ✅ `twap-executor.test.ts`

**Untested (9/13):**
- `dry-run-executor.ts` — **HIGH PRIORITY** (dry run logic)
- `order-executor.ts` — **HIGH PRIORITY** (order execution)
- `rollback-handler.ts` — **HIGH PRIORITY** (error recovery)
- `polymarket-adapter.ts` — MEDIUM PRIORITY (exchange adapter)
- `polymarket-signer.ts` — MEDIUM PRIORITY (signing logic)
- `execution-path-planner.ts` — LOW PRIORITY (path planning)
- `multi-leg-frank-wolfe-optimizer.ts` — LOW PRIORITY (optimization)
- `on-chain-position-reconciler.ts` — LOW PRIORITY (reconciliation)
- `order-validator.ts` — LOW PRIORITY (validation logic)
- `split-clob-entry.ts` — LOW PRIORITY (CLOB entry)

**Risk Assessment:** MEDIUM-HIGH. Critical execution paths (dry-run, order execution, rollback) untested. 3 HIGH-priority files.

---

### 5. FEEDS (6.7% coverage) — 14 untested files

**Tested (1/15):**
- ✅ `feed-aggregator.test.ts`

**Untested (14/15):**
- ALL are LOW PRIORITY (WebSocket clients, price feeds, market feeds)
- `binance-ws.ts`, `bybit-ws.ts`, `okx-ws.ts` — Exchange feed connectors
- `kalshi-price-feed.ts`, `limitless-price-feed.ts`, `predictit-price-feed.ts`, `smarkets-price-feed.ts` — Prediction market feeds
- `polymarket-websocket-feed.ts`, `polymarket-ws-feed.ts` — Polymarket WebSocket feeds
- `polymarket-websocket-message-parser.ts` — Message parsing
- `news-impact-analyzer.ts`, `news-market-correlator.ts` — News analysis
- `whale-activity-feed.ts` — Whale activity tracking
- `websocket-client.ts` — Base WebSocket client

**Risk Assessment:** MEDIUM. Feed adapters are numerous but typically isolated. Low business-logic complexity in these files. However, aggregator (already tested) is the critical piece.

---

### 6. BILLING (30.8% coverage) — 9 untested files

**Tested (4/13):**
- ✅ `dunning-service.test.ts`
- ✅ `license-service.test.ts`
- ✅ `payment-service.test.ts`
- ✅ `subscription-service.test.ts`

**Untested (9/13):**
- `api-key-manager.ts` — **HIGH PRIORITY** (API key management)
- `coupon-service.ts` — **HIGH PRIORITY** (coupon handling)
- `nowpayments-service.ts` — **HIGH PRIORITY** (payment processor)
- `onboarding-service.ts` — **HIGH PRIORITY** (customer onboarding)
- `usage-metering.ts` — LOW PRIORITY (metering logic)
- `overage-calculator.ts` — LOW PRIORITY (calculation logic)
- `revenue-analytics.ts` — LOW PRIORITY (analytics)
- `revenue-metrics.ts` — LOW PRIORITY (metrics)
- `workflow.ts` — LOW PRIORITY (workflow definitions)

**Risk Assessment:** MEDIUM-HIGH. Payment-critical services (API key manager, coupons, NOWPayments) untested. Potential compliance/financial risk.

---

## Priority Untested Files Summary

### 🔴 HIGH PRIORITY (18 files) — Business Logic & Execution
```
arbitrage/binary-arbitrage-executor.ts
arbitrage/binary-opportunity-detector.ts
arbitrage/cross-market-arbitrage-detector.ts
arbitrage/cross-platform-arb-detector.ts
arbitrage/neg-risk-arb-scanner.ts
arbitrage/regime-detector.ts
arbitrage/split-merge-arb-executor.ts
arbitrage/spread-detector.ts
billing/api-key-manager.ts
billing/coupon-service.ts
billing/nowpayments-service.ts
billing/onboarding-service.ts
execution/dry-run-executor.ts
execution/order-executor.ts
execution/rollback-handler.ts
intelligence/market-context-builder.ts
messaging/jetstream-manager.ts
messaging/nats-connection-manager.ts
```

### 🟡 MEDIUM PRIORITY (3 files) — Infrastructure/Config
```
arbitrage/config.ts
execution/polymarket-adapter.ts
execution/polymarket-signer.ts
```

### 🟢 LOW PRIORITY (44 files) — Utility/External Clients
```
[Feed clients, analytics, metrics, compliance types, etc.]
```

---

## Recommendations (Prioritized)

### Phase 1: CRITICAL (Address within 1 sprint)
1. **Intelligence Module** (12 untested files, 86% gap)
   - Create test suite for `market-context-builder.ts` (trading signal risk)
   - Create integration tests for `signal-fusion-engine.ts`
   - Add unit tests for vector embedding logic
   - **Estimated effort:** 40-50 hours

2. **Arbitrage Executors** (8 HIGH-priority files)
   - Create test suite for `binary-arbitrage-executor.ts` + `binary-opportunity-detector.ts`
   - Add edge case tests for `regime-detector.ts`, `spread-detector.ts`
   - **Estimated effort:** 30-40 hours

3. **Execution Safety** (3 HIGH-priority files)
   - Critical: Test `order-executor.ts` (financial transaction risk)
   - Test `rollback-handler.ts` error scenarios
   - Test `dry-run-executor.ts` pre-trade validation
   - **Estimated effort:** 20-30 hours

### Phase 2: HIGH (Next 2 sprints)
4. **Billing Services** (4 HIGH-priority files)
   - Test `api-key-manager.ts` (authentication/authorization)
   - Test `nowpayments-service.ts` (payment integration)
   - **Estimated effort:** 25-35 hours

5. **Messaging Infrastructure** (2 HIGH-priority files)
   - Test `jetstream-manager.ts` and `nats-connection-manager.ts`
   - **Estimated effort:** 15-20 hours

### Phase 3: MEDIUM (Ongoing)
6. **Exchange Adapters** (Polymarket adapter, signer)
   - Mock exchange responses, test transaction signing
   - **Estimated effort:** 15-20 hours

7. **Feed Clients** (14 files, low complexity)
   - Unit tests for WebSocket parsers
   - Mock external feed responses
   - **Estimated effort:** 30-40 hours

---

## Coverage Gap Analysis

| Category | Count | % of Target |
|----------|-------|------------|
| Source files (6 modules) | 85 | 100% |
| With tests | 20 | 23.5% |
| Untested | 65 | 76.5% |
| HIGH priority untested | 18 | 21% of total files |
| MEDIUM priority untested | 3 | 3.5% of total files |
| LOW priority untested | 44 | 52% of total files |

**Target:** 80%+ coverage. **Current:** 23.5%.
**Gap:** 57 percentage points. Requires systematic testing of HIGH and MEDIUM priority files.

---

## Testing Readiness

### ✅ What's Working
- Test infrastructure (vitest) configured correctly
- 44 test files organized in `__tests__` subdirectories
- 570 tests all passing
- Core modules (arbitrage, execution, billing) have baseline tests

### ⚠️ What Needs Attention
- Intelligence module untested (signal generation critical)
- Arbitrage opportunity detection logic untested
- Execution rollback/error paths untested
- Billing payment flow partially untested
- Feeds module minimal coverage (only aggregator)

### 🔴 Critical Gaps
1. **No tests for signal-fusion-engine.ts** — Core to trading strategy
2. **No tests for order-executor.ts** — Financial transaction execution
3. **No tests for nowpayments-service.ts** — Payment processor
4. **No integration tests** across message bus → arbitrage → execution flow

---

## Next Steps

1. **Immediate (Week 1):** Create test suites for HIGH-priority files (Phase 1)
2. **Short-term (Weeks 2-4):** Address MEDIUM and remaining HIGH-priority files (Phases 2-3)
3. **Ongoing:** Maintain 80%+ coverage for all future code changes
4. **Post-implementation:** Run full coverage report with `@vitest/coverage-v8` to validate % metrics

---

## Unresolved Questions

1. Is there a specific order preference for testing HIGH-priority files? (e.g., arbitrage before execution?)
2. Should integration tests be created across message bus → arbitrage → execution flow?
3. Are there performance benchmarks or load testing requirements for feeds/messaging?
4. Should payment processing be tested with real NOWPayments test account or mock?
