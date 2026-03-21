// License key validator for algo-trade RaaS platform
// Verifies HMAC-SHA256 signature and checks expiry / feature / trade limits

import { timingSafeEqual } from 'node:crypto';
import type { TierFeature } from '../users/subscription-tier.js';
import {
  parseLicenseKey,
  toBase64Url,
  signHmac,
  type LicensePayload,
} from './license-generator.js';

export interface ValidationResult {
  valid: boolean;
  payload?: LicensePayload;
  error?: string;
}

/**
 * Verify HMAC signature using timing-safe comparison, then check expiry.
 */
export function validateLicense(key: string, secret: string): ValidationResult {
  const dotIdx = key.lastIndexOf('.');
  if (dotIdx === -1) {
    return { valid: false, error: 'Malformed license key' };
  }

  const payloadPart = key.slice(0, dotIdx);
  const sigPart = key.slice(dotIdx + 1);

  // Recompute expected signature
  const expectedSig = toBase64Url(signHmac(payloadPart, secret));

  // Timing-safe comparison to prevent timing attacks
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  const actualBuf = Buffer.from(sigPart, 'utf8');

  if (
    expectedBuf.length !== actualBuf.length ||
    !timingSafeEqual(expectedBuf, actualBuf)
  ) {
    return { valid: false, error: 'Invalid signature' };
  }

  // Signature valid — now parse payload
  const payload = parseLicenseKey(key);
  if (!payload) {
    return { valid: false, error: 'Failed to parse payload' };
  }

  if (isExpired(payload)) {
    return { valid: false, payload, error: 'License expired' };
  }

  return { valid: true, payload };
}

/**
 * Check if a license payload is past its expiry timestamp.
 */
export function isExpired(payload: LicensePayload): boolean {
  return Date.now() > payload.expiresAt;
}

/**
 * Check whether a given feature is enabled in the payload.
 */
export function hasFeature(payload: LicensePayload, feature: TierFeature): boolean {
  return payload.features.includes(feature);
}

/**
 * Check if another trade is allowed given today's count.
 * maxTradesPerDay of -1 means unlimited.
 */
export function canTrade(payload: LicensePayload, currentTradeCount: number): boolean {
  if (payload.maxTradesPerDay === -1) return true;
  return currentTradeCount < payload.maxTradesPerDay;
}

/**
 * Returns whole days remaining until license expiry.
 * Returns 0 if already expired.
 */
export function getRemainingDays(payload: LicensePayload): number {
  const msLeft = payload.expiresAt - Date.now();
  if (msLeft <= 0) return 0;
  return Math.floor(msLeft / (1000 * 60 * 60 * 24));
}

/**
 * Check whether a market count is within the licensed limit.
 * maxMarkets of -1 means unlimited.
 */
export function canAccessMarkets(payload: LicensePayload, marketCount: number): boolean {
  if (payload.maxMarkets === -1) return true;
  return marketCount <= payload.maxMarkets;
}
