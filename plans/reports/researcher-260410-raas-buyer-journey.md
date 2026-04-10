# Research Report: RaaS Buyer Journey — Khi Người Dùng Mua

**Date:** 2026-04-10
**Context:** algo-trader RaaS (Robot-as-a-Service) — khách hàng mua license để dùng trading bot

---

## Executive Summary

RaaS infrastructure **~70% production-ready**. Licensing, billing (USDT), metering, rate limiting, admin panel, dunning đều có. Thiếu: onboarding automation, API key rotation, self-hosted guide, database scaling, feature gate enforcement.

---

## Buyer Journey Hiện Tại (What Exists)

```
Customer ──► [???] ──► License Key ──► API Access ──► Trading
              │              │              │              │
         (MISSING)      (EXISTS)       (EXISTS)       (EXISTS)
         Onboarding   license-service  rate-limiter  algo-trade
                      raas-gate        metering      strategies
```

### Step 1: Discovery & Signup — MISSING
- Không có `/api/v1/onboarding` flow
- Không có email verification → license generation pipeline
- Không có landing page → checkout → activate flow

### Step 2: Payment — EXISTS
- NOWPayments USDT TRC20 (IPN webhooks)
- HMAC-SHA512 signature verification
- Subscription lifecycle (create → active → suspend → cancel)
- Dunning: auto-suspend sau 7 ngày + 3 failed retries

### Step 3: License Activation — EXISTS
- Format: `raas-{tier}-XXXX-XXXX`
- 3 tiers: FREE (1K calls), PRO (10K), ENTERPRISE (100K)
- Admin create → customer activate → validated per request

### Step 4: API Access — EXISTS
- Rate limiting: FREE 10/min, PRO 100/min, ENTERPRISE 1K/min
- X-RateLimit headers
- Usage metering + threshold alerts (80%, 90%, 100%)
- Overage: PRO $0.01/call, ENTERPRISE $0.005/call

### Step 5: Trading — EXISTS
- 43+ strategies, paper trading mode default
- NATS event-driven, ILP solver, AI validation
- Dashboard at port 3001

---

## Gap Analysis — Cái Gì Thiếu Cho Production

| # | Gap | Priority | Effort |
|---|-----|----------|--------|
| G1 | **Onboarding flow** (signup → verify → license → dashboard) | CRITICAL | Medium |
| G2 | **API key rotation** (customer-facing key management) | HIGH | Low |
| G3 | **Self-hosted deployment guide** + offline license validation | HIGH | Medium |
| G4 | **PostgreSQL migration** for licenses (currently JSON/SQLite) | HIGH | Medium |
| G5 | **Feature gate enforcement** across all premium endpoints | MEDIUM | Low |
| G6 | **Webhook resilience** (retry, idempotency, dead-letter) | MEDIUM | Low |
| G7 | **Revenue analytics** (cohort, churn, LTV) | LOW | Medium |

---

## Deployment Models cho Khách Hàng

### Model A: Managed (Recommended for launch)
```
Customer → API Key → algo-trader Cloud (M1 Max) → Polymarket
                         │
                    License validation
                    Rate limiting
                    Usage metering
```
- Customer chỉ cần API key, không quản lý infra
- Anh quản lý M1 Max, Redis, NATS
- Billing qua NOWPayments USDT

### Model B: Self-Hosted (Future)
```
Customer → Docker image → Customer's VPS → Polymarket
              │
         License phone-home
         to validation API
```
- Customer chạy Docker stack riêng
- License validation gọi về central API
- Cần: offline license mode, deployment guide

### Model C: Hybrid (Best of both)
```
Customer → Local trading engine + Cloud AI validation
              │                        │
         Self-hosted execution   Managed DeepSeek/NATS
```
- Execution trên customer VPS (low latency)
- AI validation + semantic discovery trên managed cloud

---

## Recommended Next Steps (Priority)

### Phase A: Launch MVP RaaS (1-2 tuần)
1. **Onboarding endpoint** — `POST /api/v1/signup` → email → `POST /api/v1/activate` → license
2. **API key in header** — `X-API-Key: raas-pro-XXXX-XXXX` → validate → rate limit → execute
3. **Feature gates** — Audit all routes, add `requireTier('PRO')` middleware where missing
4. **Landing page** — Pricing table, signup form, Polar.sh checkout (not NOWPayments for intl)

### Phase B: Scale (2-4 tuần)
5. **PostgreSQL for licenses** — migrate from JSON file to DB
6. **API key rotation** — `POST /api/v1/keys/rotate`
7. **Webhook resilience** — retry + idempotency + dead-letter queue
8. **Self-hosted Docker guide** — `docker pull ghcr.io/longtho638-jpg/algo-trader:latest`

### Phase C: Monetize (ongoing)
9. **Revenue dashboard** — cohort analysis, churn, LTV
10. **Affiliate/reseller** — revenue split, referral tracking
11. **Polar.sh integration** — international payments (replace NOWPayments for non-crypto users)

---

## Pricing Model (Existing)

| Tier | Price | API Calls/mo | Rate Limit | Strategies | AI Features |
|------|-------|-------------|------------|------------|-------------|
| FREE | $0 | 1,000 | 10/min | Basic (5) | No |
| PRO | ~$49/mo | 10,000 | 100/min | All (43+) | Semantic + ILP |
| ENTERPRISE | ~$199/mo | 100,000 | 1,000/min | All + Custom | Full AI suite |

---

## Security Concerns cho RaaS

1. **Private key isolation** — BYOK model (customer brings own key). NEVER store customer private keys on managed infra.
2. **API key security** — hash keys in DB, never log full keys
3. **Tenant isolation** — tenantId field exists but not enforced at data layer
4. **Wallet isolation** — per-wallet already implemented (wallet-manager.ts)

---

## Unresolved Questions

1. Polar.sh hay NOWPayments cho international billing? (Polar flagged "wellness" — need neutral description)
2. Customer private keys: BYOK only or managed custody option?
3. SLA commitment cho managed tier? (uptime, latency guarantees)
4. Self-hosted: phone-home license validation or offline JWT?
5. Affiliate/reseller revenue split percentage?
