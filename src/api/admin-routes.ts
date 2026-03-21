// Admin-only API routes for revenue analytics and user management
// Gate: user email ends with @cashclaw.cc OR user.role === 'admin'
// Endpoints under /api/admin/* — requires valid JWT/ApiKey auth first

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { UserStore } from '../users/user-store.js';
import type { Tier } from '../users/subscription-tier.js';
import { sendJson, readJsonBody } from './http-response-helpers.js';
import { AdminAnalytics } from '../admin/admin-analytics.js';

// ─── Admin gate ────────────────────────────────────────────────────────────────

const ADMIN_EMAIL_DOMAIN = '@cashclaw.cc';

/**
 * Check if the requesting user has admin privileges.
 * Admin = email ends with @cashclaw.cc OR role field === 'admin'.
 */
function isAdminUser(userId: string, userTier: Tier, userStore: UserStore): boolean {
  const user = userStore.getUserById(userId);
  if (!user) return false;
  if (user.email.endsWith(ADMIN_EMAIL_DOMAIN)) return true;
  // role field is not on User model yet — check tier as fallback sentinel
  // tier === 'enterprise' users from cashclaw domain get admin; others do not
  return false;
}

function sendForbidden(res: ServerResponse): void {
  sendJson(res, 403, { error: 'Forbidden', message: 'Admin access required' });
}

function sendNotFound(res: ServerResponse): void {
  sendJson(res, 404, { error: 'Not Found' });
}

function sendMethodNotAllowed(res: ServerResponse): void {
  sendJson(res, 405, { error: 'Method Not Allowed' });
}

// ─── Route handlers ───────────────────────────────────────────────────────────

/** GET /api/admin/stats — overview: totalUsers, mrr, arpu, tierDistribution, newThisMonth */
function handleAdminStats(
  res: ServerResponse,
  analytics: AdminAnalytics,
): void {
  const mrr = analytics.getMRR();
  const stats = analytics.getUserStats();
  const arpu = stats.totalUsers > 0
    ? Math.round((mrr / stats.totalUsers) * 100) / 100
    : 0;

  sendJson(res, 200, {
    totalUsers: stats.totalUsers,
    mrr,
    arpu,
    tierDistribution: stats.byTier,
    newThisMonth: stats.newThisMonth,
    churnRate: stats.churnRate,
  });
}

/** GET /api/admin/users — list all users with tier, createdAt, lastLogin */
function handleAdminUsers(
  res: ServerResponse,
  userStore: UserStore,
): void {
  const users = userStore.listActiveUsers();
  const safeUsers = users.map((u) => ({
    id: u.id,
    email: u.email,
    tier: u.tier,
    createdAt: u.createdAt,
    active: u.active,
    polarCustomerId: u.polarCustomerId,
  }));
  sendJson(res, 200, { users: safeUsers, count: safeUsers.length });
}

/** GET /api/admin/revenue — mrr, 30-day timeline, top traders */
function handleAdminRevenue(
  res: ServerResponse,
  analytics: AdminAnalytics,
): void {
  const mrr = analytics.getMRR();
  const timeline = analytics.getRevenueTimeline(30);
  const topTraders = analytics.getTopTraders(10);
  sendJson(res, 200, { mrr, timeline, topTraders });
}

/** POST /api/admin/users/:id/tier — body: { tier } — manual tier override */
async function handleAdminSetTier(
  req: IncomingMessage,
  res: ServerResponse,
  targetUserId: string,
  userStore: UserStore,
): Promise<void> {
  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON body' });
    return;
  }

  const tier = body['tier'] as string | undefined;
  const validTiers: Tier[] = ['free', 'pro', 'enterprise'];
  if (!tier || !validTiers.includes(tier as Tier)) {
    sendJson(res, 400, { error: 'Invalid tier', valid: validTiers });
    return;
  }

  const updated = userStore.updateTier(targetUserId, tier as Tier);
  if (!updated) {
    sendJson(res, 404, { error: 'User not found', userId: targetUserId });
    return;
  }

  sendJson(res, 200, { ok: true, userId: targetUserId, tier });
}

// ─── Main admin route dispatcher ──────────────────────────────────────────────

/**
 * Handle all /api/admin/* routes.
 * userId and userTier are resolved by auth middleware before this is called.
 */
export async function handleAdminRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  userTier: Tier,
  userStore: UserStore,
  pathname: string,
): Promise<void> {
  // Gate: verify admin privileges
  if (!isAdminUser(userId, userTier, userStore)) {
    sendForbidden(res);
    return;
  }

  const method = req.method ?? 'GET';
  const analytics = new AdminAnalytics(userStore);

  // GET /api/admin/stats
  if (pathname === '/api/admin/stats') {
    if (method !== 'GET') { sendMethodNotAllowed(res); return; }
    handleAdminStats(res, analytics);
    return;
  }

  // GET /api/admin/users
  if (pathname === '/api/admin/users') {
    if (method !== 'GET') { sendMethodNotAllowed(res); return; }
    handleAdminUsers(res, userStore);
    return;
  }

  // GET /api/admin/revenue
  if (pathname === '/api/admin/revenue') {
    if (method !== 'GET') { sendMethodNotAllowed(res); return; }
    handleAdminRevenue(res, analytics);
    return;
  }

  // POST /api/admin/users/:id/tier
  const tierMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/tier$/);
  if (tierMatch) {
    if (method !== 'POST') { sendMethodNotAllowed(res); return; }
    await handleAdminSetTier(req, res, tierMatch[1]!, userStore);
    return;
  }

  sendNotFound(res);
}
