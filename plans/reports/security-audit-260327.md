# Security Audit Report — CashClaw Coupon + NOWPayments Integration

**Date:** 2026-03-27
**Auditor:** code-reviewer agent
**Scope:** 9 files across coupon CRUD, payment webhook, server middleware, landing page, admin dashboard

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 3     |
| HIGH     | 5     |
| MEDIUM   | 4     |
| LOW      | 3     |

**Overall Assessment:** The system has several critical vulnerabilities, primarily around webhook signature verification (signature bypass via re-serialization), timing-unsafe API key comparison, and a coupon use-counting race condition. The landing page and dashboard are well-built from an XSS perspective. CORS and helmet configs are reasonable but need tightening.

---

## CRITICAL Findings

### C1. IPN Webhook Signature Bypass via Re-Serialized Body

**File:** `src/api/routes/webhooks/nowpayments-webhook.ts` line 43
**File:** `src/billing/nowpayments-service.ts` lines 98-128

**Description:**
The webhook handler does `const rawBody = JSON.stringify(req.body)` to produce the "raw body" for HMAC verification. However, `express.json()` has already parsed the body — then re-serializing with `JSON.stringify()` can produce a different string than the original HTTP body. JSON allows semantically equivalent but byte-different representations: extra whitespace, key ordering, Unicode escapes, number formatting (1.0 vs 1), duplicate keys. NOWPayments signs the *actual HTTP body bytes*, not a re-serialized version.

The code comment on line 30-31 acknowledges this: `"Store raw body via express.json({ verify: ... }) — handled in server setup"` — but the server setup at `src/api/server.ts:77` uses plain `express.json()` **without** a `verify` callback. The raw body is never captured.

**Additionally**, the `verifyWebhook` method at line 105-107 re-parses the "rawBody" and re-serializes with sorted keys. This double re-serialization means the computed HMAC will almost never match NOWPayments' actual signature unless the body happens to be already sorted with identical formatting.

**Exploitation Scenario:**
- Currently, legitimate webhooks may silently fail verification (returns `false`), meaning payments might not activate subscriptions.
- If the team has "worked around" this by setting `NOWPAYMENTS_IPN_SECRET` to empty, then the `if (!this.ipnSecret) return false` at line 99-101 would reject all webhooks. OR if they changed it to `return true` as a workaround, ALL webhook calls would pass without verification.

**Fix:**
```typescript
// In server.ts, capture raw body:
this.app.use(express.json({
  verify: (req: any, _res, buf) => {
    req.rawBody = buf;
  }
}));

// In webhook handler:
const rawBody = (req as any).rawBody?.toString('utf-8');
if (!rawBody) return res.status(400).json({ error: 'Missing raw body' });

// In verifyWebhook: sort keys of the PARSED body, then stringify once:
const parsed = JSON.parse(rawBody);
const sortedKeys = Object.keys(parsed).sort();
const sorted = JSON.stringify(parsed, sortedKeys);
// Then HMAC the sorted string (this matches NOWPayments' documented algorithm)
```

---

### C2. Timing-Unsafe API Key Comparison

**File:** `src/api/routes/coupon-routes.ts` line 60
**File:** `src/middleware/admin-auth.ts` line 36, 66

**Description:**
Admin API key validation uses `Set.has(apiKey)` which internally uses JavaScript's `===` string comparison. This is NOT timing-safe — the comparison short-circuits on the first differing character, leaking key length and prefix bytes via response timing.

**Exploitation Scenario:**
An attacker can brute-force the API key character-by-character by measuring response time differences. With ~36 characters (alphanumeric), each position requires at most 36 requests = ~1,152 requests to recover a 32-char key. Realistic over a network with statistical averaging.

**Fix:**
```typescript
import { timingSafeEqual } from 'crypto';

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// Replace Set.has() with iteration + safeCompare:
function isValidKey(apiKey: string, validKeys: Set<string>): boolean {
  for (const key of validKeys) {
    if (safeCompare(apiKey, key)) return true;
  }
  return false;
}
```

---

### C3. Coupon Use Count Race Condition — Unlimited Free Usage

**File:** `src/billing/coupon-service.ts` lines 96-123, 126-133
**File:** `src/api/routes/coupon-routes.ts` lines 93-165

**Description:**
The `applyCoupon()` method checks `coupon.currentUses >= coupon.maxUses` (line 112) but does NOT increment the counter. The counter is only incremented by `recordUse()` (line 129), which is **never called** anywhere in the codebase (confirmed by grep). This means:

1. Coupons with `maxUses: 1` can be applied unlimited times since `currentUses` never increments.
2. Even if `recordUse()` were called, there's a TOCTOU race: between the check at line 112 and the increment at line 129, concurrent requests can all pass the check.

**Exploitation Scenario:**
- Attacker creates multiple browser tabs, enters a max-1-use coupon, clicks "Apply" simultaneously. All requests pass validation. All get discounted checkout URLs.
- Even a single-use 100% discount coupon grants unlimited free access.

**Fix:**
```typescript
// Option A: Atomic check-and-increment in applyCoupon
applyCoupon(code: string, tier: string, originalPrice: number) {
  const coupon = this.coupons.get(code.toUpperCase().trim());
  // ... validation ...
  if (coupon.maxUses > 0 && coupon.currentUses >= coupon.maxUses) {
    return { valid: false, ... };
  }
  // Increment IMMEDIATELY (before returning to caller)
  coupon.currentUses++;
  this.save();
  // ... compute price ...
  return { valid: true, discountedPrice, discountPercent };
}

// Option B: For production, use a database with transactions (SQLite is available)
```

---

## HIGH Findings

### H1. No Body Size Limit on Express JSON Parser

**File:** `src/api/server.ts` line 77

**Description:**
`express.json()` is called without a `limit` option. Default is `100kb` (Express docs), which is reasonable for most APIs but the webhook endpoint could receive large payloads. More importantly, `express.urlencoded({ extended: true })` on line 78 also has no limit, and `extended: true` enables nested object parsing (via `qs` library) which can cause DoS with deeply nested payloads.

**Exploitation Scenario:**
Attacker sends `POST /api/coupons/apply` with a 100KB body, or deeply nested URL-encoded payload to cause CPU spike.

**Fix:**
```typescript
this.app.use(express.json({ limit: '16kb' }));
this.app.use(express.urlencoded({ extended: false, limit: '16kb' }));
```

---

### H2. Coupon Code Input Not Sanitized for Path Traversal in Deactivate Route

**File:** `src/api/routes/coupon-routes.ts` line 87

**Description:**
`req.params.code` is passed directly from URL path. While the internal Map lookup (`coupon-service.ts` line 142) does `code.toUpperCase().trim()`, the Express route `DELETE /:code` accepts arbitrary strings including `../`, `%00`, etc. in the URL path. The coupon service Map lookup prevents actual path traversal, but the raw param is logged and could affect downstream systems.

The `use-coupons.ts` hook (line 78) correctly uses `encodeURIComponent(code)` for the DELETE call, but an attacker calling the API directly bypasses this.

**Exploitation Scenario:**
Limited impact due to Map-based storage, but if logging includes the raw code, log injection is possible (e.g., `code=\nINFO: admin logged in`).

**Fix:**
```typescript
// Add validation at route level:
const code = req.params.code?.replace(/[^A-Z0-9_-]/gi, '');
if (!code) return res.status(400).json({ error: 'Invalid coupon code format' });
```

---

### H3. Webhook Endpoint Excluded from Rate Limiting

**File:** `src/api/server.ts` lines 121-122

**Description:**
The comment says "no rate limit — external provider callbacks" but this means ANY attacker can flood the webhook endpoint. NOWPayments sends from specific IPs but the server doesn't validate source IP.

**Exploitation Scenario:**
DDoS the `/api/webhooks/nowpayments` endpoint. Each request triggers JSON parsing, HMAC computation (CPU-intensive crypto.subtle), and potentially database writes.

**Fix:**
```typescript
// Add separate rate limit for webhook:
const webhookLimiter = rateLimit({
  windowMs: 60000,
  max: 30, // NOWPayments won't send more than ~30 IPNs/min
  keyGenerator: (req) => req.ip || 'unknown',
});
this.app.use('/api/webhooks/nowpayments', webhookLimiter, nowpaymentsWebhookRouter);

// Also consider IP allowlisting for NOWPayments IPs
```

---

### H4. Invoice ID Enumeration via Hardcoded Values

**File:** `src/api/routes/coupon-routes.ts` lines 14-38
**File:** `src/landing/public/index.html` lines 661-665

**Description:**
Invoice IDs are hardcoded in source code AND exposed in the landing page JavaScript. All 13 invoice IDs across 4 projects are visible. These are NOWPayments pre-created invoice IDs.

Landing page exposes: `4725459350`, `5493882802`, `5264305182` with `sid` parameters.

**Exploitation Scenario:**
Attacker can enumerate all product invoice IDs. While NOWPayments invoices require payment to activate, knowing IDs allows:
- Monitoring payment activity via public NOWPayments pages
- Creating checkout links with arbitrary `order_id` values
- Potential confusion attacks (sending a user to a different tier's checkout)

**Fix:**
Move invoice IDs to environment variables (already partially done in `nowpayments-service.ts`). Remove `sid` parameters from landing page. Generate checkout URLs server-side only.

---

### H5. Admin API Key Stored in localStorage (XSS → Full Admin Access)

**File:** `dashboard/src/pages/coupon-admin-page.tsx` line 53, 68
**File:** `dashboard/src/hooks/use-coupons.ts` line 36

**Description:**
The admin API key is stored in `localStorage` and sent as `X-API-Key` header on every request. If any XSS vulnerability exists in the dashboard (now or in the future), the attacker gets full admin API access.

**Exploitation Scenario:**
Any XSS in the dashboard reads `localStorage.getItem('adminApiKey')` and exfiltrates it.

**Fix:**
- Use `httpOnly` session cookies instead of localStorage for admin auth
- At minimum, use `sessionStorage` (cleared when tab closes)
- Implement short-lived JWT tokens with refresh rotation

---

## MEDIUM Findings

### M1. CORS Origin Defaults to Single Domain

**File:** `src/api/server.ts` line 41

**Description:**
CORS defaults to `https://cashclaw.cc` but the coupon system serves 4 projects (cashclaw, openclaw, sophia, mekong) with different domains. The landing page JS calls `https://api.cashclaw.cc/api/coupons/apply` directly. If other project landing pages need to call the same API, they'll be blocked by CORS — unless `CORS_ORIGIN` env var is set to `*`.

If set to `*`, credentials-based requests are blocked by browsers, but `X-API-Key` header-based auth is not credential-based, so a wildcard CORS would expose admin endpoints to any origin.

**Fix:**
```typescript
corsOrigin: (process.env.CORS_ORIGIN || 'https://cashclaw.cc').split(','),
```
Explicitly list allowed origins per project.

---

### M2. Coupon Data Persisted to World-Readable JSON File

**File:** `src/billing/coupon-service.ts` line 21, 51-62

**Description:**
Coupons are stored in `data/coupons.json` using `writeFileSync` with default permissions (typically `0644`). The `data/` directory is gitignored (confirmed), but on the server any process can read coupon codes and discount details.

No file found at `data/coupons.json` on disk (never created yet or deleted), but when created it will have default permissions.

**Fix:**
```typescript
import { writeFileSync, chmodSync } from 'fs';
writeFileSync(DATA_FILE, JSON.stringify(...));
chmodSync(DATA_FILE, 0o600); // owner-only read/write
```
Or better: migrate coupon storage to SQLite (already used for licenses, users, audit).

---

### M3. Coupon Apply Endpoint Leaks Valid Tier Names on Error

**File:** `src/api/routes/coupon-routes.ts` lines 107-108

**Description:**
When an invalid tier is provided, the error response includes all valid tier names: `"Invalid tier for cashclaw. Use: STARTER, PRO, ELITE"`. This leaks product structure.

**Exploitation Scenario:**
Attacker enumerates projects and tiers by trying different combinations: `project=sophia&tier=X` reveals all sophia tiers.

**Fix:**
```typescript
return res.status(400).json({ error: 'Invalid tier' }); // don't enumerate valid tiers
```

---

### M4. No CSRF Protection on Coupon Apply Endpoint

**File:** `src/api/routes/coupon-routes.ts` line 93

**Description:**
The `/api/coupons/apply` endpoint accepts POST with JSON body and has no CSRF token validation. While CORS provides some protection (browser won't send JSON Content-Type cross-origin without preflight), an attacker could use `navigator.sendBeacon` or form-based attacks to trigger coupon applications.

**Fix:**
Add CSRF token for authenticated endpoints. For the public `/apply` endpoint, CORS preflight with specific origins + rate limiting is sufficient if properly configured.

---

## LOW Findings

### L1. Webhook Signature Comparison Not Timing-Safe

**File:** `src/billing/nowpayments-service.ts` line 123

**Description:**
`computed === signature` uses standard string comparison for HMAC signatures. An attacker could theoretically determine the correct HMAC byte-by-byte via timing attacks, though this is less practical for HMAC-SHA512 (512-bit) over network.

**Fix:**
```typescript
return timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(signature, 'hex'));
```

---

### L2. Console/Logger Leaks Invoice Details in Error Path

**File:** `src/api/routes/coupon-routes.ts` line 150

**Description:**
`logger.error('[Coupon] NOWPayments invoice creation failed', invoice)` logs the full NOWPayments API response, which may contain API key echo or internal details in error responses.

**Fix:**
Log only `invoice.statusCode` and `invoice.message`, not the full response object.

---

### L3. Landing Page Coupon Apply Sends 3 Parallel Requests

**File:** `src/landing/public/index.html` lines 776-786

**Description:**
When a user applies a coupon, the landing page fires 3 parallel fetch requests (one per tier). This triples server load per coupon application and could amplify the race condition in C3.

**Fix:**
Single request to a new endpoint like `/api/coupons/validate` that returns discount info without creating invoices. Only create an invoice when the user clicks a specific tier's checkout button.

---

## Positive Observations

1. **XSS Prevention in Landing Page** (line 710-734): Price display uses `document.createElement` and `textContent` instead of `innerHTML`. Well done.
2. **Helmet Configuration** (server.ts lines 56-73): Comprehensive CSP, HSTS with preload, frame-ancestors deny, strict directives.
3. **Dashboard Hook** (use-coupons.ts line 78): Uses `encodeURIComponent(code)` for DELETE requests.
4. **Error Handler Separation**: Global error handler middleware prevents stack traces from leaking.
5. **Graceful Shutdown**: Proper SIGTERM/SIGINT handling in app.ts.
6. **.gitignore Coverage**: `.env`, `/data/`, and `.env.production` all gitignored. No secrets found in source.
7. **Audit Log Service**: Webhook handler uses `AuditLogService` for tracking payment events.

---

## Recommended Actions (Priority Order)

1. **[CRITICAL] Fix raw body capture** for webhook HMAC verification (C1)
2. **[CRITICAL] Fix coupon race condition** — increment in `applyCoupon()` or move to SQLite with transactions (C3)
3. **[CRITICAL] Add timing-safe comparison** for API key validation (C2)
4. **[HIGH] Add body size limits** to Express JSON parser (H1)
5. **[HIGH] Add rate limiting** to webhook endpoint (H3)
6. **[HIGH] Move invoice IDs** to environment variables, remove from landing page JS (H4)
7. **[HIGH] Replace localStorage** with httpOnly cookies for admin auth (H5)
8. **[HIGH] Add coupon code format validation** regex at route level (H2)
9. **[MEDIUM] Tighten CORS** to explicit multi-origin list (M1)
10. **[MEDIUM] Set file permissions** on coupons.json or migrate to SQLite (M2)

---

## Unresolved Questions

1. Is `NOWPAYMENTS_IPN_SECRET` actually configured in production? If empty, all webhooks are rejected — meaning the payment flow may be silently broken.
2. Is `recordUse()` intentionally unused, or was the webhook handler integration missed?
3. Are there other services (Fastify-based, per `admin-auth.ts`) running alongside this Express server? The codebase has both Express and Fastify auth middleware, suggesting a migration in progress. Both need the same fixes.
4. What is the deployment model? If behind Cloudflare, some rate limiting and IP filtering may already be handled at the edge.
