// Referral system REST API route handlers
// POST /api/referral/generate  — generate a referral code
// POST /api/referral/redeem    — redeem a code (link referrer→referee)
// GET  /api/referral/stats     — stats across all user codes
// GET  /api/referral/my-codes  — list all user's codes
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ReferralStore } from '../referral/referral-store.js';
import { RewardCalculator } from '../referral/reward-calculator.js';
import { ReferralManager } from '../referral/referral-manager.js';
import type { AuthenticatedRequest } from './auth-middleware.js';
import { sendJson, readJsonBody } from './http-response-helpers.js';

// ── Module-level singletons ─────────────────────────────────────────────────

const REFERRAL_DB_PATH = process.env['REFERRAL_DB_PATH'] ?? 'data/referral.db';

const store = new ReferralStore(REFERRAL_DB_PATH);
const calculator = new RewardCalculator(store);
const manager = new ReferralManager(store, calculator);

// ── Handlers ───────────────────────────────────────────────────────────────

/** POST /api/referral/generate — create a new referral code for the user */
async function handleGenerate(
  req: AuthenticatedRequest,
  res: ServerResponse,
): Promise<void> {
  const userId = req.user!.id;
  try {
    const code = manager.generateCode(userId);
    sendJson(res, 201, { code: code.code, maxUses: code.maxUses });
  } catch (err) {
    sendJson(res, 500, { error: 'Internal Server Error', message: err instanceof Error ? err.message : 'Failed to generate code' });
  }
}

/** POST /api/referral/redeem — redeem a referral code */
async function handleRedeem(
  req: AuthenticatedRequest,
  res: ServerResponse,
): Promise<void> {
  let body: { code?: unknown };
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: 'Bad Request', message: 'Invalid JSON body' });
    return;
  }

  if (typeof body.code !== 'string' || !body.code.trim()) {
    sendJson(res, 400, { error: 'Bad Request', message: 'code is required' });
    return;
  }

  const userId = req.user!.id;
  try {
    const link = manager.redeemCode(body.code.trim(), userId);
    sendJson(res, 200, { referrerId: link.referrerId, code: link.code, createdAt: link.createdAt });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to redeem code';
    sendJson(res, 400, { error: 'Bad Request', message: msg });
  }
}

/** GET /api/referral/stats — aggregate stats across all user codes */
function handleStats(
  req: AuthenticatedRequest,
  res: ServerResponse,
): void {
  const userId = req.user!.id;
  try {
    const codes = manager.getUserCodes(userId);
    let totalConversions = 0;
    let totalRevenueNum = 0;
    const codeStats = codes.map((c) => {
      const s = manager.getCodeStats(c.code);
      totalConversions += s.conversions;
      totalRevenueNum += parseFloat(s.revenueAttributed);
      return s;
    });
    sendJson(res, 200, {
      codes: codeStats,
      totalConversions,
      totalRevenue: totalRevenueNum.toFixed(2),
    });
  } catch (err) {
    sendJson(res, 500, { error: 'Internal Server Error', message: err instanceof Error ? err.message : 'Failed to fetch stats' });
  }
}

/** GET /api/referral/my-codes — list all codes owned by user */
function handleMyCodes(
  req: AuthenticatedRequest,
  res: ServerResponse,
): void {
  const userId = req.user!.id;
  try {
    const codes = manager.getUserCodes(userId);
    sendJson(res, 200, { codes });
  } catch (err) {
    sendJson(res, 500, { error: 'Internal Server Error', message: err instanceof Error ? err.message : 'Failed to fetch codes' });
  }
}

// ── Dispatcher ─────────────────────────────────────────────────────────────

/**
 * Route dispatcher for referral endpoints.
 * Returns true if the pathname was matched and handled; false otherwise.
 */
export async function handleReferralRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
): Promise<boolean> {
  const auth = req as AuthenticatedRequest;

  if (!auth.user) {
    sendJson(res, 401, { error: 'Unauthorized', message: 'Authentication required' });
    return true;
  }

  if (pathname === '/api/referral/generate' && method === 'POST') {
    await handleGenerate(auth, res);
    return true;
  }

  if (pathname === '/api/referral/redeem' && method === 'POST') {
    await handleRedeem(auth, res);
    return true;
  }

  if (pathname === '/api/referral/stats' && method === 'GET') {
    handleStats(auth, res);
    return true;
  }

  if (pathname === '/api/referral/my-codes' && method === 'GET') {
    handleMyCodes(auth, res);
    return true;
  }

  return false;
}
