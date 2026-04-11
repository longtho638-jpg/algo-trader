# Full Project Audit -- CashClaw (algo-trader)

**Date:** 2026-04-11
**Auditor:** code-reviewer agent (Opus 4.6)
**Scope:** Entire codebase, focus on PRs #58-#84

---

## Audit Report

**Overall Score: 6.5/10**
- Critical: 4
- High: 7
- Medium: 9
- Low: 6

### Per-Dimension Scores

| Dimension | Score | Notes |
|---|---|---|
| Code Quality | 6/10 | 8 `any` types, 25 console.log, 4 TODOs, 40+ files >200 LOC |
| Security | 5/10 | Hardcoded JWT fallback, wildcard CORS, HMAC stub, weak password rules |
| Error Handling | 7/10 | 293 catch blocks, no empty catches found, some `catch {}` swallows |
| Type Safety | 8/10 | 0 TS errors, only 8 `: any` + 87 `as any`/`@ts-ignore` in tests |
| Architecture | 7/10 | Clean module separation, good messaging layer, some circular risk |
| Trading Safety | 7/10 | Paper mode default, Kelly sizer, circuit breaker, but some gaps |
| Test Coverage | 5/10 | 570 tests pass, but only 20/103 key modules have tests (~19%) |
| Documentation | 6/10 | README thorough, docs/ exists, but stale references to 43 strategies |

---

### Critical Issues (must fix before RaaS launch)

#### C1. Hardcoded JWT Secret Fallback
**File:** `src/workers/auth-handlers.ts:21`
```ts
return env.JWT_SECRET || 'cashclaw-dev-secret-not-for-prod';
```
If `JWT_SECRET` is unset in production, ALL tokens are signed with a known string. Attacker can forge any JWT.
**Fix:** Throw an error if `JWT_SECRET` is missing. Never fall back to a hardcoded value.

#### C2. HMAC Signature Not Implemented (Polymarket Adapter)
**File:** `src/execution/polymarket-adapter.ts` (lines 180, 206, 216)
Four TODO comments show HMAC-SHA256 signing is STUBBED OUT. Any authenticated CLOB API call will fail or be unauthenticated.
**Fix:** Implement HMAC signing using `crypto.createHmac('sha256', apiSecret)` before live trading.

#### C3. Wildcard CORS on Auth Endpoints
**Files:** `src/workers/auth-handlers.ts:10`, `src/workers/edge-proxy.ts:17`
`Access-Control-Allow-Origin: *` on auth signup/login endpoints. Combined with JWT tokens in responses, any origin can capture credentials.
**Fix:** Restrict CORS to specific allowed origins. Use env var `ALLOWED_ORIGINS`.

#### C4. Weak Password Policy
**File:** `src/workers/auth-handlers.ts:42`
Only enforces `password.length < 6`. No complexity requirements. For a RaaS platform handling API keys and trading, this is insufficient.
**Fix:** Require minimum 8 chars with mixed case or special characters.

---

### High Priority

#### H1. 19% Test Coverage on Key Modules
Only 20 of 103 audited modules in key directories have tests. Critical untested modules:
- `src/execution/polymarket-adapter.ts` (live order execution)
- `src/execution/dry-run-executor.ts` (435 LOC, paper trading core)
- `src/wiring/paper-trading-orchestrator.ts` (main pipeline glue)
- `src/arbitrage/trading-loop.ts` (core engine)
- `src/middleware/feature-gate.ts` (tier access control)
- `src/middleware/admin-auth.ts` (admin authentication)
- All 5 price feed modules (Kalshi, PredictIt, Smarkets, Limitless, whale)
- All 12 intelligence modules (except 2)

#### H2. 40+ Files Exceed 200-Line Limit
All 43 Polymarket strategy files are 400-600 lines. `src/telegram/bot.ts` is 608 lines. `src/arbitrage/spread-detector.ts` is 591 lines.
Per project rules, files should be <200 LOC.
**Fix:** Extract strategy common patterns into base class. Split bot.ts into command handlers.

#### H3. Paper Trading Simulates Resolution with Random Numbers
**File:** `src/wiring/paper-trading-orchestrator.ts:126-131`
```ts
if (isEndgameTrade) {
  won = Math.random() < 0.95;
} else {
  won = Math.random() < 0.52; // slight positive bias
}
```
P&L is simulated with dice rolls, not actual market resolution. Paper trading results are meaningless for strategy validation.
**Fix:** Track actual market resolutions via Gamma API or CLOB settlement events.

#### H4. Position Size Hardcoded in Trading Loop
**File:** `src/arbitrage/trading-loop.ts:253-254`
```ts
amount: 1000, // Default amount
fee: 0.001, // Default fee
```
Hardcoded $1000 amount per trade. Should use Kelly sizer or configurable position sizing.

#### H5. Scattered process.env Access
60+ direct `process.env` reads across codebase (scanner, adapters, billing, etc). No centralized validation.
`src/config/env.ts` exists but only covers notification vars. Trading keys (`POLY_PRIVATE_KEY`, `BINANCE_API_KEY`, etc.) are read ad-hoc.
**Fix:** Centralize ALL env vars in `src/config/env.ts` with validation.

#### H6. No Rate Limiting on Trading API Endpoints
No rate limiter middleware found on API routes. A malicious or buggy client could flood the system.

#### H7. `as any` Usage (87 occurrences)
Mostly in test files (expected) but also in production code: `trading-loop.ts:246`, `nowpayments-webhook.ts:31`, `suspension-check.ts`, `auth-handlers.ts`.

---

### Medium Priority

#### M1. Module-Level Mutable Singletons
`paper-trading-orchestrator.ts` uses module-level `let portfolio` state. `whale-activity-feed.ts` uses `let feedInstance`. This makes testing difficult and creates hidden coupling.

#### M2. Uncapped Latency Samples Array
`src/arbitrage/trading-loop.ts:293` caps at 1000 entries via `shift()` which is O(n). Use a ring buffer for O(1).

#### M3. Console.log in Production Code
25 occurrences in `src/cli/cashclaw-cli.ts` (19), `src/dashboard/dashboard-demo-data.ts` (5), `src/api/__tests__/api.test.ts` (1). CLI console.log is acceptable but dashboard demo data should use logger.

#### M4. No Input Validation on Webhook Body
`src/api/routes/webhooks/nowpayments-webhook.ts:57` casts `req.body as NowPaymentsIpnPayload` without schema validation. Should use zod or similar.

#### M5. Stale Phase 10 Cosmic Code
`src/arbitrage/phase10_cosmic/daoGovernance/` contains governance-proposer.ts. Appears to be aspirational/placeholder code. Should be removed or moved to a feature branch.

#### M6. Mixed Express and Fastify Usage
`admin-auth.ts` uses Fastify types. `feature-gate.ts` and webhook routes use Express types. Should standardize.

#### M7. No Graceful Shutdown for NATS Message Bus
`NatsMessageBus.close()` exists but there is no drain before close -- in-flight messages may be lost.

#### M8. Cache Eviction in WhaleActivityFeed Uses Iteration
`whale-activity-feed.ts:103` manually iterates Set to drop oldest 200 entries. Works but fragile.

#### M9. No Circuit Breaker on External API Calls
External calls to Gamma API, Polymarket CLOB, LLM endpoints lack circuit breaker wrapping despite `CircuitBreaker` class existing in `src/resilience/`.

---

### Low Priority

#### L1. `require('express')` in Webhook Route
`nowpayments-webhook.ts:30` uses `require('express')` inline instead of import.

#### L2. Dead `REQUIRED_NOTIFICATION_VARS` Validation
`src/config/env.ts` defines required vars for notification services but `validateEnvVars()` is only called if notification features are used. Trading keys are unvalidated.

#### L3. Signal Fusion Engine Weight Bounds
`MAX_WEIGHT = 2.0` allows a single signal to dominate. Consider tighter bound.

#### L4. Nonce Generation Not Cryptographically Secure
`polymarket-signer.ts:143` uses `Math.random()` for nonce generation. Should use `crypto.randomBytes`.

#### L5. Telegram Bot Token in Multiple Places
Token is read in both `trading-alerts.ts:18` and `bot.ts:41` separately. Should share config.

#### L6. No Retry Logic on Telegram API Calls
`trading-alerts.ts` sends Telegram messages with no retry on failure. Rate limits or transient errors cause silent alert loss.

---

### Positive Observations

1. **TypeScript compiles clean** -- 0 errors with `tsc --noEmit`. Excellent.
2. **570 tests all pass** in 6.89s. Fast, reliable test suite.
3. **Paper mode is DEFAULT** -- `src/polymarket/trading-pipeline.ts:2` explicitly documents this. Safe-by-default.
4. **Kelly Position Sizer** is well-implemented with managed capital caps (quarter-Kelly default, 5% max position). Good risk management.
5. **Circuit Breaker pattern** properly implemented in `src/resilience/circuit-breaker.ts` with open/half-open/closed states.
6. **Private key validation** in `PolymarketSigner` rejects paper/placeholder keys before constructing wallet. Fail-closed.
7. **HMAC webhook verification** for NOWPayments IPN is implemented and enforced (signature checked before processing).
8. **Structured logging** via Winston with production JSON format. No raw `console.log` in core modules.
9. **NATS messaging layer** is clean, well-typed with `IMessageBus` interface abstraction and topic schema validation.
10. **Signal Fusion Engine** is pure math (no LLM dependency), defensively coded with input clamping and zero-weight handling.
11. **EIP-712 signing** for Polymarket orders is correctly implemented following spec.
12. **Feature gate middleware** with tier hierarchy is clean and extensible.

---

### Production Readiness Verdict

**CONDITIONAL -- NOT READY for live trading, READY for paper trading + RaaS billing beta**

**Must fix before any live trading:**
1. C1: Hardcoded JWT fallback (auth bypass)
2. C2: HMAC stub (CLOB auth broken)
3. C3: Wildcard CORS on auth (credential theft)
4. H3: Random P&L simulation (invalid backtesting)
5. L4: Non-cryptographic nonce (order collision risk)

**Must fix before RaaS launch:**
1. C4: Weak password policy
2. H1: Test coverage on middleware/auth/billing modules
3. H5: Centralized env validation
4. H6: Rate limiting on API
5. M4: Webhook input validation

**Can proceed with:**
- Paper trading demo (current state works for demo)
- Billing/subscription flow (NOWPayments webhook verified)
- CLI/Telegram alerts (functional, well-structured)

---

### Unresolved Questions

1. Is the mixed Express/Fastify usage intentional (migration in progress?) or accidental?
2. What is the status of `phase10_cosmic` DAO governance code -- active development or dead code?
3. Are the 43 Polymarket strategies meant to be distinct implementations or should they share a base class pattern?
4. The README claims "4477+ automated tests" but vitest reports 570. Where are the other ~3900 tests?
