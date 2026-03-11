# Phase 1A: RaaS REST API Gateway

## Overview
REST API router built on Node http module for tenant/strategy management.
Reuses existing TenantStrategyManager + StrategyMarketplace.

## Requirements
- Tenant CRUD (create/list/get/update)
- Strategy assign/remove per tenant
- Trade status + P&L query
- Input validation via Zod
- Rate limiting (reuse exchange-router pattern)

## Files to Create
- `src/core/raas-api-router.ts` (max 150 lines)
- `src/core/raas-api-router.test.ts` (max 120 lines)

## Architecture
```
HTTP Request → raas-api-router
  POST /api/tenants          → createTenant(config)
  GET  /api/tenants          → listTenants()
  GET  /api/tenants/:id      → getTenant(id)
  POST /api/tenants/:id/strategies → assignStrategy(id, strategyName)
  DELETE /api/tenants/:id/strategies/:name → removeStrategy(id, name)
  GET  /api/tenants/:id/pnl  → getPnl(id)
  POST /api/tenants/:id/paper-trade → startPaperTrade(id)
```

## Implementation
- Use http.createServer (no Express dependency)
- JSON request/response
- Zod schemas for request validation
- Delegate to TenantStrategyManager for business logic
- Return proper HTTP status codes (200, 201, 400, 404, 500)

## Success Criteria
- [ ] All endpoints respond correctly
- [ ] Zod validation rejects invalid input
- [ ] Tests cover happy + error paths
- [ ] TypeScript strict, 0 errors
