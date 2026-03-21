// License key generator for algo-trade RaaS platform
// Signs license payloads with HMAC-SHA256 using node:crypto
// Format: base64url(JSON payload) + '.' + base64url(HMAC signature)

import { createHmac } from 'node:crypto';
import type { Tier, TierFeature } from '../users/subscription-tier.js';

export interface LicensePayload {
  userId: string;
  tier: Tier;
  /** Feature flags included in this license */
  features: TierFeature[];
  /** Max concurrent active markets (Infinity stored as -1) */
  maxMarkets: number;
  /** Max trades per day (-1 = unlimited) */
  maxTradesPerDay: number;
  /** Unix timestamp ms */
  issuedAt: number;
  /** Unix timestamp ms */
  expiresAt: number;
}

/** Tier defaults for maxMarkets and maxTradesPerDay */
const TIER_DEFAULTS: Record<Tier, Pick<LicensePayload, 'maxMarkets' | 'maxTradesPerDay' | 'features'>> = {
  free: {
    maxMarkets: 1,
    maxTradesPerDay: 5,
    features: [],
  },
  pro: {
    maxMarkets: 10,
    maxTradesPerDay: -1, // unlimited
    features: ['backtesting', 'multi-market'],
  },
  enterprise: {
    maxMarkets: -1, // unlimited
    maxTradesPerDay: -1, // unlimited
    features: ['backtesting', 'optimizer', 'webhook', 'multi-market'],
  },
};

/** Encode buffer or string to base64url (no padding) */
function toBase64Url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Decode base64url string to Buffer */
function fromBase64Url(input: string): Buffer {
  // Restore standard base64 padding
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4;
  const padded2 = pad === 0 ? padded : padded + '='.repeat(4 - pad);
  return Buffer.from(padded2, 'base64');
}

/**
 * Generate HMAC-SHA256 signature for a message string.
 */
function signHmac(message: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(message).digest();
}

/**
 * Build a LicensePayload with tier defaults applied.
 * Caller can override maxMarkets / maxTradesPerDay / features.
 */
export function buildPayload(
  base: Pick<LicensePayload, 'userId' | 'tier' | 'issuedAt' | 'expiresAt'> &
    Partial<Pick<LicensePayload, 'maxMarkets' | 'maxTradesPerDay' | 'features'>>,
): LicensePayload {
  const defaults = TIER_DEFAULTS[base.tier];
  return {
    userId: base.userId,
    tier: base.tier,
    features: base.features ?? defaults.features,
    maxMarkets: base.maxMarkets ?? defaults.maxMarkets,
    maxTradesPerDay: base.maxTradesPerDay ?? defaults.maxTradesPerDay,
    issuedAt: base.issuedAt,
    expiresAt: base.expiresAt,
  };
}

/**
 * Create a signed license key string from a payload.
 * Returns: base64url(payload JSON) + '.' + base64url(HMAC-SHA256 signature)
 */
export function generateLicense(payload: LicensePayload, secret: string): string {
  const payloadPart = toBase64Url(JSON.stringify(payload));
  const sig = signHmac(payloadPart, secret);
  return `${payloadPart}.${toBase64Url(sig)}`;
}

/**
 * Extract payload from license key WITHOUT verifying signature.
 * Use validateLicense() for trusted access.
 */
export function parseLicenseKey(key: string): LicensePayload | null {
  const dotIdx = key.lastIndexOf('.');
  if (dotIdx === -1) return null;
  try {
    const payloadBuf = fromBase64Url(key.slice(0, dotIdx));
    return JSON.parse(payloadBuf.toString('utf8')) as LicensePayload;
  } catch {
    return null;
  }
}

/** Get tier defaults (useful for seeding forms / documentation) */
export function getTierDefaults(tier: Tier) {
  return { ...TIER_DEFAULTS[tier] };
}

export { toBase64Url, fromBase64Url, signHmac };
