// Usage reporting API routes for algo-trade RaaS platform
// GET /api/usage/me — current user's usage report (24h window)
// GET /api/usage/quota — remaining quota for current user
// GET /api/admin/usage/system — system-wide usage report (admin only)

import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendJson } from './http-response-helpers.js';
import type { AuthenticatedRequest } from './auth-middleware.js';
import type { UsageTracker } from '../metering/usage-tracker.js';
import { UsageReporter } from '../metering/usage-reporter.js';
import { QuotaEnforcer } from '../metering/quota-enforcer.js';
import type { Tier } from '../users/subscription-tier.js';

let _tracker: UsageTracker | null = null;
export function setUsageTracker(tracker: UsageTracker): void { _tracker = tracker; }

const ONE_HOUR = 60 * 60 * 1000;
const ONE_DAY = 24 * ONE_HOUR;

export function handleUsageRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
): boolean {
  if (method !== 'GET') {
    sendJson(res, 405, { error: 'Method Not Allowed' });
    return true;
  }

  if (!_tracker) {
    sendJson(res, 503, { error: 'Usage tracking not configured' });
    return true;
  }

  const authReq = req as AuthenticatedRequest;
  const user = authReq.user;
  if (!user) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return true;
  }

  const reporter = new UsageReporter(_tracker);
  const enforcer = new QuotaEnforcer(_tracker);

  // GET /api/usage/me
  if (pathname === '/api/usage/me') {
    const report = reporter.generateUserReport(user.id, ONE_DAY);
    sendJson(res, 200, { report });
    return true;
  }

  // GET /api/usage/quota
  if (pathname === '/api/usage/quota') {
    const quota = enforcer.checkQuota(user.id, user.tier as Tier);
    sendJson(res, 200, { quota });
    return true;
  }

  return false;
}

/** Admin-only system usage report: GET /api/admin/usage/system */
export function handleAdminUsageRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
): boolean {
  if (pathname !== '/api/admin/usage/system') return false;
  if (method !== 'GET') {
    sendJson(res, 405, { error: 'Method Not Allowed' });
    return true;
  }
  if (!_tracker) {
    sendJson(res, 503, { error: 'Usage tracking not configured' });
    return true;
  }

  const reporter = new UsageReporter(_tracker);
  const report = reporter.generateSystemReport(ONE_DAY);
  sendJson(res, 200, { report });
  return true;
}
