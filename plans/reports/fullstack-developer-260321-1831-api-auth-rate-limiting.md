# Phase Implementation Report

### Executed Phase
- Phase: API Authentication & Rate Limiting
- Plan: none (direct task)
- Status: completed

### Files Modified

| File | Action | Notes |
|---|---|---|
| `src/api/auth-middleware.ts` | Rewritten | JWT HS256 (crypto), API key middleware, AuthenticatedRequest type |
| `src/api/api-rate-limiter-middleware.ts` | Created | Sliding window rate limiter, per-tier limits |
| `src/users/user-store.ts` | Enhanced | Added `generateApiKey()`, `validateApiKey()`, fixed `polarCustomerId/polarSubscriptionId` in `createUser` return |
| `src/api/server.ts` | Rewritten | CORS for cashclaw.cc, full middleware chain: CORS→Auth→RateLimit→Routes, overloaded signature |
| `src/api/index.ts` | Updated | Re-exported new symbols, removed stale `validateApiKey` export |

### Tasks Completed

- [x] JWT creation/validation using Node.js `crypto` (HS256, no external library)
- [x] API key validation middleware via user-store lookup
- [x] `createAuthMiddleware(userStore, jwtSecret)` — extracts user from `Bearer <jwt>`, `ApiKey <key>`, or `X-API-Key` header
- [x] `generateApiKey(userId)` on UserStore — generates `ak_` prefixed 64-char hex key, replaces existing
- [x] `validateApiKey(key)` on UserStore — wrapper around `getUserByApiKey`
- [x] `createRateLimitMiddleware()` — sliding window, per-user/per-IP key
- [x] Tier limits: Free=10/min, Pro=100/min, Enterprise=1000/min
- [x] 429 response with `Retry-After` header + `X-RateLimit-Limit/Remaining`
- [x] CORS restricted to `cashclaw.cc` + `www.cashclaw.cc` + localhost dev; reflects exact origin
- [x] Full middleware chain wired in `server.ts`
- [x] All imports use `.js` extensions (ESM)
- [x] Files stay under 200 lines

### Tests Status
- Type check: pass (0 errors)
- Unit tests: pass (110/110)

### Issues Encountered

- `user-store.ts` had been extended since initial read (added Polar fields) — `createUser` was missing `polarCustomerId/polarSubscriptionId` in return object; fixed.
- `api/index.ts` still exported old `validateApiKey` function signature (deleted from auth-middleware) — updated barrel to export new symbols.

### Next Steps

- `JWT_SECRET` env var should be set in production (fallback is `dev-secret-change-me`)
- `USER_DB_PATH` env var controls SQLite path when using legacy `createServer(port, engine)` overload
- Consider adding `/api/auth/token` endpoint to issue JWTs from API key credentials
