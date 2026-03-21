// Copy trading REST API route handlers
// GET  /api/leaders          - top traders ranked by score
// GET  /api/leaders/:id      - single leader profile
// POST /api/copy/:leaderId   - follow a leader (Pro+ only)
// DELETE /api/copy/:leaderId - unfollow a leader
// GET  /api/copy/my          - list followed leaders + P&L attribution
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { LeaderBoard } from '../copy-trading/leader-board.js';
import type { FollowerManager } from '../copy-trading/follower-manager.js';
import type { AuthenticatedRequest } from './auth-middleware.js';
import type { Tier } from '../users/subscription-tier.js';
import { sendJson, readJsonBody } from './http-response-helpers.js';

// ─── Guards ───────────────────────────────────────────────────────────────────

/** Tiers allowed to use copy trading */
const COPY_TRADING_TIERS = new Set<Tier>(['pro', 'enterprise']);

function requireProTier(req: AuthenticatedRequest, res: ServerResponse): boolean {
  if (!req.user) {
    sendJson(res, 401, { error: 'Unauthorized', message: 'Authentication required' });
    return false;
  }
  if (!COPY_TRADING_TIERS.has(req.user.tier)) {
    sendJson(res, 403, {
      error: 'Forbidden',
      message: 'Copy trading requires Pro or Enterprise subscription',
    });
    return false;
  }
  return true;
}

// ─── Route handlers ───────────────────────────────────────────────────────────

/** GET /api/leaders?limit=20 — ranked list of top traders */
function handleListLeaders(req: IncomingMessage, res: ServerResponse, lb: LeaderBoard): void {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const raw = parseInt(url.searchParams.get('limit') ?? '20', 10);
  const limit = Math.min(isNaN(raw) ? 20 : raw, 100);
  const leaders = lb.getTopTraders(limit);
  sendJson(res, 200, { leaders, count: leaders.length });
}

/** GET /api/leaders/:id — single leader profile */
function handleGetLeader(_req: IncomingMessage, res: ServerResponse, id: string, lb: LeaderBoard): void {
  const profile = lb.getTraderProfile(id);
  if (!profile) { sendJson(res, 404, { error: 'Not Found', message: `Leader ${id} not found` }); return; }
  sendJson(res, 200, { leader: profile });
}

/** POST /api/copy/:leaderId — start copying a leader (Pro+ only) */
async function handleFollowLeader(
  req: AuthenticatedRequest,
  res: ServerResponse,
  leaderId: string,
  fm: FollowerManager,
  lb: LeaderBoard,
): Promise<void> {
  if (!requireProTier(req, res)) return;

  if (!lb.getTraderProfile(leaderId)) {
    sendJson(res, 404, { error: 'Not Found', message: `Leader ${leaderId} not found` });
    return;
  }

  let body: { allocation?: number; maxCopySize?: string };
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: 'Bad Request', message: 'Invalid JSON body' });
    return;
  }

  const allocation = typeof body.allocation === 'number' ? body.allocation : 0.1;
  if (allocation <= 0 || allocation > 1) {
    sendJson(res, 400, { error: 'Bad Request', message: 'allocation must be > 0 and <= 1' });
    return;
  }

  try {
    const relation = fm.follow(req.user!.id, leaderId, allocation, body.maxCopySize ?? '1000');
    sendJson(res, 201, { message: 'Now copying leader', relation });
  } catch (err) {
    sendJson(res, 409, { error: 'Conflict', message: err instanceof Error ? err.message : 'Failed to follow' });
  }
}

/** DELETE /api/copy/:leaderId — stop copying a leader */
function handleUnfollowLeader(
  req: AuthenticatedRequest,
  res: ServerResponse,
  leaderId: string,
  fm: FollowerManager,
): void {
  if (!requireProTier(req, res)) return;
  const ok = fm.unfollow(req.user!.id, leaderId);
  if (!ok) { sendJson(res, 404, { error: 'Not Found', message: 'No active follow relation found' }); return; }
  sendJson(res, 200, { message: 'Unfollowed leader', leaderId });
}

/** GET /api/copy/my — list leaders the authenticated user is copying */
function handleMyFollowing(
  req: AuthenticatedRequest,
  res: ServerResponse,
  fm: FollowerManager,
  lb: LeaderBoard,
): void {
  if (!requireProTier(req, res)) return;
  const relations = fm.getFollowing(req.user!.id);
  const following = relations.map((r) => ({ ...r, leaderProfile: lb.getTraderProfile(r.leaderId) }));
  sendJson(res, 200, { following, count: following.length });
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

export interface CopyTradingHandlers {
  leaderBoard: LeaderBoard;
  followerManager: FollowerManager;
}

/**
 * Route dispatcher for copy-trading endpoints.
 * Returns true if the pathname was matched and handled; false otherwise.
 */
export async function handleCopyTradingRoute(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
  { leaderBoard: lb, followerManager: fm }: CopyTradingHandlers,
): Promise<boolean> {
  const auth = req as AuthenticatedRequest;

  if (pathname === '/api/leaders' && method === 'GET') {
    handleListLeaders(req, res, lb); return true;
  }

  const leaderIdMatch = pathname.match(/^\/api\/leaders\/([^/]+)$/);
  if (leaderIdMatch && method === 'GET') {
    handleGetLeader(req, res, leaderIdMatch[1]!, lb); return true;
  }

  // /api/copy/my must be matched before /api/copy/:id
  if (pathname === '/api/copy/my' && method === 'GET') {
    handleMyFollowing(auth, res, fm, lb); return true;
  }

  const copyIdMatch = pathname.match(/^\/api\/copy\/([^/]+)$/);
  if (copyIdMatch) {
    if (method === 'POST') { await handleFollowLeader(auth, res, copyIdMatch[1]!, fm, lb); return true; }
    if (method === 'DELETE') { handleUnfollowLeader(auth, res, copyIdMatch[1]!, fm); return true; }
  }

  return false;
}
