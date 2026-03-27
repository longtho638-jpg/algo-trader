# Code Review: src/app.ts + src/landing/public/index.html

**Date:** 2026-03-27
**Reviewer:** code-reviewer agent
**Scope:** New `src/app.ts` (51 LOC), modified `src/landing/public/index.html` (872 LOC)

---

## Overall Assessment

**app.ts** is clean, well-structured, testable. Solid bootstrap with graceful shutdown.

**index.html** is well-crafted landing page with coupon UI. Several security and robustness issues found, mostly medium severity. One critical finding in admin route auth.

---

## Critical Issues

### 1. CRITICAL: Coupon admin routes have NO authentication

**File:** `src/api/routes/coupon-routes.ts` (lines 25-42)

The admin endpoints (`POST /`, `GET /`, `DELETE /:code`) are completely unauthenticated. Anyone can create, list, or deactivate coupons. The existing `admin-auth.ts` middleware is Fastify-based (not Express), so it is NOT wired into these Express routes.

**Impact:** Attacker can create 100% discount coupons and get free access, or deactivate all legitimate coupons (denial of service for billing).

**Fix:** Add Express-compatible admin auth middleware to admin coupon routes:

```typescript
// Simple Express admin auth guard
function requireAdminKey(req, res, next) {
  const key = req.headers['x-api-key'];
  const valid = (process.env.ADMIN_API_KEYS || '').split(',').filter(Boolean);
  if (process.env.ADMIN_API_KEY) valid.push(process.env.ADMIN_API_KEY);
  if (!key || !valid.includes(key)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

couponRouter.post('/', requireAdminKey, async (req, res) => { ... });
couponRouter.get('/', requireAdminKey, (_req, res) => { ... });
couponRouter.delete('/:code', requireAdminKey, (req, res) => { ... });
```

### 2. CRITICAL: Coupon use count incremented on validation, not on payment

**File:** `src/billing/coupon-service.ts` (line 87)

`coupon.currentUses++` fires when `applyCoupon()` is called -- before any payment completes. A user can:
- Apply coupon, get discounted checkout URL, never pay
- Each attempt burns a use count
- Attackers can exhaust `maxUses` limit without any payment

**Fix:** Separate validation from use-count increment. Only increment after NOWPayments webhook confirms payment.

---

## High Priority

### 3. XSS via innerHTML in coupon price display

**File:** `index.html` (lines 711-719)

`updatePriceDisplay()` uses `el.innerHTML` with values from `formatPrice()`. While `formatPrice` only outputs `$` + number, the `originalPrice` and `finalPrice` come from API response JSON (`r.finalPrice`, `r.discountPercent`). If the API were compromised or a MITM injected HTML, this becomes XSS.

**Current risk:** Low (values pass through number operations which would NaN-ify HTML). But using `textContent` where possible is safer.

**Fix:** Use `textContent` for the numeric parts, or sanitize via DOM construction instead of string concatenation:

```javascript
function updatePriceDisplay(tier, originalPrice, finalPrice) {
  var el = document.getElementById('price-' + tier.toLowerCase());
  if (!el) return;
  el.textContent = ''; // clear
  if (finalPrice === 0) {
    var span = document.createElement('span');
    span.className = 'discounted-price';
    span.textContent = 'FREE';
    el.appendChild(span);
  } else if (finalPrice < originalPrice) {
    // ... build DOM nodes instead of innerHTML
  }
}
```

### 4. No body size limit on express.json()

**File:** `src/api/server.ts` (line 77)

`express.json()` defaults to 100KB, which is reasonable. However, explicitly setting a limit is a best practice to prevent large payload attacks:

```typescript
this.app.use(express.json({ limit: '10kb' }));
```

### 5. Coupon data is in-memory only (Map)

**File:** `src/billing/coupon-service.ts`

All coupons are stored in a `Map`. Server restart = all coupons lost. If this is intentional for MVP, document it. Otherwise, persist to SQLite (already used for trade history).

---

## Medium Priority

### 6. CORS origin is single-string, not array-safe for dev

**File:** `src/api/server.ts` (line 41)

`corsOrigin` defaults to `'https://cashclaw.cc'`. Landing page calls `https://api.cashclaw.cc/api/coupons/apply` -- confirm these are on different subdomains. If `api.cashclaw.cc` serves the API and `cashclaw.cc` serves the landing page, CORS must allow the landing page origin. Currently it only allows `https://cashclaw.cc`, which should be correct. But local dev will fail unless `CORS_ORIGIN` env var is set.

### 7. Coupon input not sanitized for regex/injection

**File:** `index.html` (line 834)

Input is `.trim().toUpperCase()` which is fine. `maxlength="32"` on the HTML input is good. Server-side `applyCoupon` does `.toUpperCase().trim()` on the code for Map lookup, which is safe (no SQL, no regex). No issue here -- noted as verified safe.

### 8. NOWPayments API key read at module load

**File:** `src/api/routes/coupon-routes.ts` (line 19)

`const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY || '';`

If the env var is empty, the NOWPayments API call will silently fail with auth error. Should fail fast or at least warn:

```typescript
if (!NOWPAYMENTS_API_KEY) {
  logger.warn('[Coupon] NOWPAYMENTS_API_KEY not set -- discounted invoices will fail');
}
```

### 9. Typo in landing page copy

**File:** `index.html` (line 535)

```html
<p class="section-subheading">Pick your edge. Cancel anytime. Pay with USDT..</p>
```

Double period at end (`USDT..`).

---

## Low Priority

### 10. app.ts module-level `server` variable

Using module-level `let server` is fine for a single-instance app. The `require.main === module` guard is correct for test isolation.

### 11. Landing page is 872 lines

Per project rules, HTML files don't need modularization. But if more JS is added to the coupon logic, consider extracting the `<script>` block to a separate file.

---

## Edge Cases Found by Scout

1. **Admin auth mismatch:** `admin-auth.ts` is Fastify-based but server uses Express. The coupon admin routes are completely unprotected as a result.
2. **Race condition on coupon apply:** Three parallel fetch calls to `/api/coupons/apply` in the frontend (one per tier) each increment `currentUses`. A coupon with `maxUses: 1` burns 3 uses per single user apply action.
3. **Free access flow has no backend activation:** When `freeAccess: true`, frontend shows alert but no backend call creates an actual subscription/access record.
4. **Graceful shutdown doesn't set timeout:** `server.close()` waits indefinitely for open connections. Should add a force-kill timeout (e.g., 10s).

---

## Positive Observations

- Clean separation: app.ts is bootstrap-only, routes in server.ts
- Helmet with strict CSP, HSTS preload, frame-ancestors: none
- Rate limiting on /api endpoints
- Sentry integration for error tracking
- `require.main === module` guard for testability
- Input has `maxlength`, `autocomplete="off"`, `spellcheck="false"`
- `aria-live="polite"` on coupon message for accessibility
- Responsive design with mobile breakpoints

---

## Recommended Actions (Priority Order)

1. **[CRITICAL]** Add Express admin auth middleware to coupon CRUD routes
2. **[CRITICAL]** Move coupon use-count increment to post-payment webhook
3. **[HIGH]** Fix triple-increment: frontend sends 3 parallel apply calls per action -- restructure to 1 call, then compute tier prices client-side
4. **[HIGH]** Replace innerHTML with DOM construction in `updatePriceDisplay`
5. **[MEDIUM]** Add body size limit to `express.json()`
6. **[MEDIUM]** Persist coupons to SQLite or warn this is MVP-only
7. **[MEDIUM]** Add graceful shutdown timeout in app.ts
8. **[LOW]** Fix double period typo on line 535

---

## Metrics

- Type Coverage: app.ts is fully typed, coupon routes use `any` on catch (line 29)
- Test Coverage: Not assessed (review only)
- Linting Issues: Not assessed (review only)

## Unresolved Questions

1. Is the admin-auth Fastify middleware intentionally left unwired, or is there a migration from Fastify to Express in progress?
2. Is in-memory coupon storage intentional for MVP, or should it be persisted?
3. What activates a user's subscription after a 100% coupon? No backend flow found.
