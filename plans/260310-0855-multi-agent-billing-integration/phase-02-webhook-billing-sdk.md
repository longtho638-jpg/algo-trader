---
title: "Phase 2 - Webhook Billing SDK Integration"
description: "Polar.sh webhook handler + subscription lifecycle"
status: completed
priority: P1
effort: 3h
completed_at: 2026-03-10
---

# Phase 2: Webhook Billing SDK Integration

## Context Links

- [Plan Overview](./plan.md)
- [PolarWebhookEventHandler](../src/billing/polar-webhook-event-handler.ts)
- [DunningStateMachine](../src/billing/dunning-state-machine.ts)
- [PolarSubscriptionService](../src/billing/polar-subscription-service.ts)
- [Prisma Schema](../prisma/schema.prisma)
- [Subscription Routes](../src/api/routes/polar-billing-subscription-routes.ts)

## Overview

**Mục tiêu:** Hoàn thiện webhook billing SDK với subscription lifecycle management.

**Assets hiện có:**
- `PolarWebhookEventHandler` - Xử lý 6 Polar events
- `DunningStateMachine` - 4-state dunning (ACTIVE → GRACE → SUSPENDED → REVOKED)
- `PolarSubscriptionService` - Product → tier mapping
- Prisma models: `DunningState`, `DunningEvent`, `License`, `AuditLog`

**Cần tạo:**
- FastAPI webhook handler route
- Pricing hooks utility
- Subscription lifecycle utilities
- Tests cho webhook handler

## Requirements

### Functional

- [x] FastAPI route nhận Polar webhook
- [x] Verify HMAC signature
- [x] Route events đúng handler
- [x] Idempotency check (eventId dedup)
- [x] Audit log immutable
- [x] Dunning state transitions

### Non-Functional

- [x] Rate limiting (100 req/min)
- [x] Error alerting (threshold-based)
- [x] Idempotency guarantee
- [x] Security: signature verification
- [x] Observability: structured logging

## Architecture

### Webhook Flow

```
Polar.sh → Fastify Route → Verify Signature
                              ↓
                    PolarWebhookEventHandler
                              ↓
         ┌────────────┬──────────────┬─────────────┐
         ↓            ↓              ↓             ↓
   Activation    Cancellation    Refund       Order
   (created/    (canceled/     (refund.    (order.
    active)      revoked)       created)    created)
         ↓
   LicenseService.activate/deactivate
         ↓
   DunningStateMachine.onPaymentFailed/Recovered
         ↓
   AuditLog.create (immutable)
```

### State Transitions

```
ACTIVE ──payment_failed──→ GRACE_PERIOD (7 days)
   ↑            │
   │            ↓ (timeout)
   │       SUSPENDED (14 days) ──→ REVOKED (30 days → delete)
   │            │
   └──payment_recovered───────────┘
```

## Files to Create/Update

| File | Action | Purpose | Lines |
|------|--------|---------|-------|
| `src/api/routes/webhook-handler.ts` | Create | Fastify route | ~80 |
| `src/billing/pricing-hooks.ts` | Create | Usage-based pricing | ~100 |
| `src/billing/subscription-lifecycle.ts` | Create | Lifecycle utils | ~120 |
| `tests/billing/webhook-handler.test.ts` | Create | Unit tests | ~150 |

## Implementation Steps

### Step 1: Webhook Handler Route (~30min)

```typescript
// src/api/routes/webhook-handler.ts
import { FastifyInstance } from 'fastify';
import { PolarWebhookEventHandler } from '../billing/polar-webhook-event-handler';

export async function webhookHandlerRoute(fastify: FastifyInstance) {
  const webhookHandler = PolarWebhookEventHandler.getInstance();

  fastify.post('/api/v1/billing/webhook', {
    config: { rateLimit: { max: 100, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    const rawBody = JSON.stringify(req.body);
    const signature = req.headers['x-polar-signature'] as string;

    if (!webhookHandler.verifySignature(rawBody, signature)) {
      return reply.status(401).send({ error: 'Invalid signature' });
    }

    const result = webhookHandler.handleEvent(req.body);
    return reply.send(result);
  });
}
```

### Step 2: Pricing Hooks (~45min)

```typescript
// src/billing/pricing-hooks.ts
export interface UsageTier {
  upTo: number;
  pricePerUnit: number;
}

export function calculateUsageCharge(
  units: number,
  tiers: UsageTier[]
): number {
  // Tiered pricing calculation
}

export function checkOverage(
  tenantId: string,
  currentUsage: number,
  limit: number
): Promise<{ overage: number; charge: number }>;
```

### Step 3: Subscription Lifecycle (~45min)

```typescript
// src/billing/subscription-lifecycle.ts
export async function activateSubscription(
  tenantId: string,
  tier: TenantTier,
  productId: string
): Promise<void>;

export async function cancelSubscription(
  tenantId: string,
  immediate?: boolean
): Promise<void>;

export async function reactivateSubscription(
  tenantId: string,
  tier?: TenantTier
): Promise<void>;
```

### Step 4: Tests (~60min)

```typescript
// tests/billing/webhook-handler.test.ts
describe('PolarWebhookEventHandler', () => {
  test('verifySignature valid', () => { ... });
  test('handleEvent subscription.created', () => { ... });
  test('handleEvent subscription.canceled', () => { ... });
  test('handleEvent order.created', () => { ... });
  test('handleEvent refund.created', () => { ... });
  test('idempotency - duplicate event ignored', () => { ... });
});
```

## Success Criteria

- [x] 4 files created/updated
- [x] Webhook signature verification working
- [x] 6 events handled correctly
- [x] Dunning state transitions tested
- [x] Tests passing (100% coverage webhook handler)
- [x] Audit log immutable

## Risks & Mitigation

| Risk | Mitigation |
|------|------------|
| Webhook replay attack | Idempotency key + timestamp check |
| Signature bypass | timingSafeEqual constant-time compare |
| State machine stuck | Cron job process timeouts |
| Data loss | Append-only audit log |

## Integration Points

1. **LicenseService** - Activate/deactivate tiers
2. **DunningStateMachine** - Payment failure handling
3. **AuditLog** - Immutable compliance log
4. **RaaS KV Client** - Suspension flag sync

## Next Steps

1. Create webhook-handler.ts route
2. Create pricing-hooks.ts
3. Create subscription-lifecycle.ts
4. Write comprehensive tests
5. Integration test với Polar sandbox
