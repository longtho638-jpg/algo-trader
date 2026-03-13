# ROIaaS Phase 4: Trade Metering - Complete

**Date:** 2026-03-13 | **Status:** ✅ Complete | **Tests:** 35/35 passing

## Summary

Implemented daily tier-based usage metering for Polymarket trading bot:
- **Free tier**: 5 trades/day + 3 signals/day + 100 API calls/day
- **Pro tier**: Unlimited trades/signals + 10,000 API calls/day
- **Enterprise tier**: Unlimited everything + 100,000 API calls/day

## Files Created

| File | Lines | Description |
|------|-------|-------------|
| `src/metering/trade-metering.ts` | 500+ | Core metering service with daily tracking |
| `src/metering/usage-api-routes.ts` | 200+ | Fastify API routes for usage endpoints |
| `src/metering/index.ts` | 25 | Module exports |
| `tests/metering/trade-metering.test.ts` | 420+ | 35 unit tests |

## Features Implemented

### 1. Tier-Based Daily Limits

```typescript
export const TIER_LIMITS: Record<LicenseTier, DailyLimits> = {
  [LicenseTier.FREE]: {
    tradesPerDay: 5,
    signalsPerDay: 3,
    apiCallsPerDay: 100,
  },
  [LicenseTier.PRO]: {
    tradesPerDay: -1, // Unlimited
    signalsPerDay: -1,
    apiCallsPerDay: 10000,
  },
  [LicenseTier.ENTERPRISE]: {
    tradesPerDay: -1,
    signalsPerDay: -1,
    apiCallsPerDay: 100000,
  },
};
```

### 2. Resource Tracking

- `trackTrade(userId)` - Track trade executions
- `trackSignal(userId)` - Track signal consumption
- `trackApiCall(userId)` - Track API calls

### 3. API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/usage` | GET | Get current user's usage status |
| `/api/usage/:userId` | GET | Get usage for specific user (admin) |
| `/api/usage/track` | POST | Track usage event |
| `/api/usage/limits` | GET | Get tier limits configuration |
| `/api/usage/overage` | GET | Get users in overage (admin) |

### 4. Upgrade Prompts

Free users who hit limits see:
```json
{
  "upgradePrompt": {
    "title": "Upgrade to Pro for Unlimited Trading",
    "description": "Your Free tier limit for trades has been reached. Upgrade to Pro for unlimited access.",
    "upgradeUrl": "/pricing"
  }
}
```

### 5. Alert System

Event emitter emits `threshold_alert` at 80%, 90%, 100% of limits:
```typescript
metering.on('threshold_alert', (alert) => {
  console.log(`User ${alert.userId} reached ${alert.threshold}% of ${alert.resourceType} limit`);
});
```

## Test Results

```
PASS tests/metering/trade-metering.test.ts
  TradeMeteringService
    ✓ Singleton pattern (2 tests)
    ✓ Tier management (3 tests)
    ✓ TIER_LIMITS configuration (3 tests)
    ✓ trackTrade - FREE tier (3 tests)
    ✓ trackTrade - PRO tier (1 test)
    ✓ trackSignal - FREE tier (2 tests)
    ✓ trackApiCall - FREE tier (2 tests)
    ✓ getUsageStatus (5 tests)
    ✓ Upgrade prompt (3 tests)
    ✓ hasExceeded* methods (4 tests)
    ✓ getOverageUsers (2 tests)
    ✓ resetUsage (1 test)
    ✓ clear (1 test)
    ✓ getTotalRecords (1 test)
    ✓ Alert events (2 tests)

Tests: 35 passed, 35 total
```

## Usage Examples

### Programmatic Usage

```typescript
import { tradeMeteringService, LicenseTier } from './src/metering';

// Set user tier
tradeMeteringService.setUserTier('user-123', LicenseTier.PRO);

// Track trade
const allowed = await tradeMeteringService.trackTrade('user-123');
if (!allowed) {
  console.log('Trade limit exceeded');
}

// Get usage status
const status = tradeMeteringService.getUsageStatus('user-123');
console.log(`Trades: ${status.trades.used}/${status.trades.limit}`);
console.log(`Can trade: ${status.canTrade}`);
```

### API Usage

```bash
# Get usage status
curl -H "X-User-ID: user-123" \
     -H "X-License-Tier: PRO" \
     http://localhost:3000/api/usage

# Track trade
curl -X POST http://localhost:3000/api/usage/track \
  -H "X-User-ID: user-123" \
  -H "Content-Type: application/json" \
  -d '{"resourceType": "trade"}'

# Get tier limits
curl http://localhost:3000/api/usage/limits
```

### Middleware Integration

```typescript
import { usageTrackingMiddleware } from './src/metering';

// Apply to API routes
app.use('/api', usageTrackingMiddleware());

// Auto-tracks API calls and adds rate limit headers
// X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Percent-Used
```

## Integration Points

### 1. Polymarket Bot Engine

```typescript
import { tradeMeteringService } from './metering';

// In bot engine, before executing trade
const userId = getAuthenticatedUser();
const allowed = await tradeMeteringService.trackTrade(userId);

if (!allowed) {
  return { error: 'Trade limit exceeded', upgradePrompt: status.upgradePrompt };
}

// Execute trade
executeTrade(signal);
```

### 2. Signal Gate Integration

```typescript
import { tradeMeteringService } from './metering';
import { defaultSignalGate } from './gate/signal-gate';

// When delivering signal
const userId = getAuthenticatedUser();

// Check signal limit
const signalAllowed = await tradeMeteringService.trackSignal(userId);
if (!signalAllowed) {
  return { delayed: true, upgradePrompt: status.upgradePrompt };
}

// Gate signal by tier
const gated = defaultSignalGate.processSignal(signal, apiKey);
return gated;
```

### 3. API Server Registration

Already registered in `src/api/fastify-raas-server.ts`:
```typescript
import { registerUsageRoutes as registerTradeMeteringRoutes } from '../metering/usage-api-routes';
void server.register(registerTradeMeteringRoutes);
```

## Next Steps (ROIaaS Phase 5+)

1. **Phase 5 - Subscription Management**: Create subscription plans with Stripe/Polar integration
2. **Phase 6 - Usage Analytics Dashboard**: Build dashboard showing usage trends
3. **Phase 7 - Overage Billing**: Auto-charge for usage over limits
4. **Phase 8 - Custom Limits**: Allow enterprise users to set custom limits

## Unresolved Questions

None - Phase 4 complete.
