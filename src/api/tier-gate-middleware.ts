// Tier-based feature gating middleware for algo-trade RaaS
// Blocks API endpoints that require specific tier features
// Routes not in the gate map are accessible to all tiers
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Tier, TierFeature } from '../users/subscription-tier.js';
import { hasFeature } from '../users/subscription-tier.js';
import { sendJson } from './http-response-helpers.js';

interface AuthedRequest extends IncomingMessage {
  user?: { id: string; email: string; tier: Tier };
}

// Map route prefixes to required tier features
const FEATURE_GATES: Array<{ prefix: string; feature: TierFeature }> = [
  { prefix: '/api/backtest', feature: 'backtesting' },
  { prefix: '/api/marketplace/', feature: 'multi-market' },
  { prefix: '/api/webhooks/tradingview/', feature: 'webhook' },
  { prefix: '/api/tv/', feature: 'webhook' },
  { prefix: '/api/pipeline/optimize', feature: 'optimizer' },
];

/**
 * Check if the authenticated user's tier grants access to the requested endpoint.
 * Returns true if allowed (or no gate applies), false if blocked (403 sent).
 */
export function checkTierGate(
  req: AuthedRequest,
  res: ServerResponse,
  pathname: string,
): boolean {
  const tier = req.user?.tier;
  if (!tier) return true; // unauthenticated — let auth middleware handle

  for (const gate of FEATURE_GATES) {
    if (pathname.startsWith(gate.prefix) || pathname === gate.prefix) {
      if (!hasFeature(tier, gate.feature)) {
        sendJson(res, 403, {
          error: 'Feature not available',
          message: `Your "${tier}" plan does not include "${gate.feature}". Upgrade to access this endpoint.`,
          requiredFeature: gate.feature,
          upgradeUrl: 'https://cashclaw.cc/pricing',
        });
        return false;
      }
    }
  }

  return true;
}
