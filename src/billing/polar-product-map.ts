// Maps Polar product IDs (from .env) to internal subscription tiers.
// Product IDs are configured via environment variables to support multiple envs.
import type { Tier } from '../users/subscription-tier.js';

/**
 * Resolve a Polar product_id to an internal Tier.
 * Falls back to 'free' when the product ID is unknown.
 *
 * Env vars:
 *   POLAR_PRODUCT_PRO        — Pro plan product ID
 *   POLAR_PRODUCT_ENTERPRISE — Enterprise plan product ID
 */
export function productIdToTier(productId: string): Tier {
  const proId = process.env['POLAR_PRODUCT_PRO'] ?? '3a7eff03';
  const enterpriseId = process.env['POLAR_PRODUCT_ENTERPRISE'] ?? 'd4aba8f3';

  if (productId === enterpriseId) return 'enterprise';
  if (productId === proId) return 'pro';
  return 'free';
}

/**
 * Map a Tier to its Polar product_id.
 * Used when creating checkouts from the tier name.
 */
export function tierToProductId(tier: Tier): string {
  const proId = process.env['POLAR_PRODUCT_PRO'] ?? '3a7eff03';
  const enterpriseId = process.env['POLAR_PRODUCT_ENTERPRISE'] ?? 'd4aba8f3';

  if (tier === 'enterprise') return enterpriseId;
  if (tier === 'pro') return proId;
  // 'free' tier has no paid checkout — callers should guard before calling
  return process.env['POLAR_PRODUCT_FREE'] ?? '4551712a';
}
