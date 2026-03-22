// License management API routes for algo-trade RaaS platform
// POST /api/license/issue — issue new license key for authenticated user
// GET /api/license/my — list current user's licenses
// POST /api/license/validate — validate a license key
// POST /api/license/revoke — revoke a license key (owner only)

import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendJson, readJsonBody } from './http-response-helpers.js';
import type { AuthenticatedRequest } from './auth-middleware.js';
import { generateLicense, buildPayload } from '../license/license-generator.js';
import { validateLicense, getRemainingDays } from '../license/license-validator.js';
import {
  initLicenseStore,
  saveLicense,
  getLicensesByUser,
  revokeLicense,
} from '../license/license-store.js';
import { getTierLimits } from '../users/subscription-tier.js';
import type { Tier } from '../users/subscription-tier.js';

const LICENSE_SECRET = process.env['LICENSE_SECRET'] ?? 'license-secret-change-me';
const LICENSE_DURATION_MS = 365 * 24 * 60 * 60 * 1000; // 1 year

// Auto-init store on first import
initLicenseStore(process.env['LICENSE_DB_PATH'] ?? 'data/licenses.db');

export function handleLicenseRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
): boolean {
  const authReq = req as AuthenticatedRequest;
  const user = authReq.user;
  if (!user) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return true;
  }

  // POST /api/license/issue
  if (pathname === '/api/license/issue' && method === 'POST') {
    const now = Date.now();
    const payload = buildPayload({
      userId: user.id,
      tier: user.tier as Tier,
      issuedAt: now,
      expiresAt: now + LICENSE_DURATION_MS,
    });
    const key = generateLicense(payload, LICENSE_SECRET);
    saveLicense(key, payload);

    const limits = getTierLimits(user.tier as Tier);
    sendJson(res, 201, {
      key,
      tier: payload.tier,
      features: payload.features,
      maxMarkets: payload.maxMarkets,
      maxTradesPerDay: payload.maxTradesPerDay,
      expiresAt: new Date(payload.expiresAt).toISOString(),
      limits,
    });
    return true;
  }

  // GET /api/license/my
  if (pathname === '/api/license/my' && method === 'GET') {
    const rows = getLicensesByUser(user.id);
    const licenses = rows.map(r => ({
      key: r.key.slice(0, 12) + '...',
      tier: r.tier,
      issuedAt: new Date(r.issuedAt).toISOString(),
      expiresAt: new Date(r.expiresAt).toISOString(),
      revoked: r.revoked === 1,
      active: r.revoked === 0 && r.expiresAt > Date.now(),
    }));
    sendJson(res, 200, { licenses, count: licenses.length });
    return true;
  }

  // POST /api/license/validate
  if (pathname === '/api/license/validate' && method === 'POST') {
    void (async () => {
      try {
        const body = await readJsonBody(req);
        const key = body['key'] as string;
        if (!key) {
          sendJson(res, 400, { error: 'Missing "key" field' });
          return;
        }
        const result = validateLicense(key, LICENSE_SECRET);
        if (result.valid && result.payload) {
          sendJson(res, 200, {
            valid: true,
            tier: result.payload.tier,
            features: result.payload.features,
            remainingDays: getRemainingDays(result.payload),
            expiresAt: new Date(result.payload.expiresAt).toISOString(),
          });
        } else {
          sendJson(res, 200, { valid: false, error: result.error });
        }
      } catch {
        sendJson(res, 400, { error: 'Invalid JSON body' });
      }
    })();
    return true;
  }

  // POST /api/license/revoke
  if (pathname === '/api/license/revoke' && method === 'POST') {
    void (async () => {
      try {
        const body = await readJsonBody(req);
        const key = body['key'] as string;
        if (!key) {
          sendJson(res, 400, { error: 'Missing "key" field' });
          return;
        }
        // Only allow revoking own licenses (verify payload userId)
        const result = validateLicense(key, LICENSE_SECRET);
        if (result.payload && result.payload.userId !== user.id) {
          sendJson(res, 403, { error: 'Cannot revoke another user\'s license' });
          return;
        }
        const revoked = revokeLicense(key);
        sendJson(res, 200, { revoked });
      } catch {
        sendJson(res, 400, { error: 'Invalid JSON body' });
      }
    })();
    return true;
  }

  return false;
}
