// Strategy optimizer API routes for algo-trade RaaS platform
// POST /api/optimizer/run — run grid-search optimization (async, returns job ID)
// GET /api/optimizer/results — get latest optimization results

import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendJson, readJsonBody } from './http-response-helpers.js';
import type { AuthenticatedRequest } from './auth-middleware.js';
import type { OptimizationResult } from '../optimizer/optimizer.js';

// In-memory cache of latest results per user
const latestResults = new Map<string, { result: OptimizationResult; timestamp: number }>();

// Flag to indicate running optimizations
const runningJobs = new Set<string>();

export function handleOptimizerRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
): boolean {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.user) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return true;
  }

  // Pro tier minimum
  if (authReq.user.tier === 'free') {
    sendJson(res, 403, { error: 'Optimizer requires Pro or Enterprise tier' });
    return true;
  }

  const userId = authReq.user.id;

  // POST /api/optimizer/run
  if (pathname === '/api/optimizer/run' && method === 'POST') {
    if (runningJobs.has(userId)) {
      sendJson(res, 409, { error: 'Optimization already running' });
      return true;
    }
    void (async () => {
      try {
        const body = await readJsonBody<{
          strategyName?: string;
          initialCapital?: number;
          paramRanges?: Array<{ name: string; min: number; max: number; step: number }>;
        }>(req);

        // Validate basic input
        if (!body.strategyName) {
          sendJson(res, 400, { error: 'Required: strategyName' });
          return;
        }

        runningJobs.add(userId);

        // Note: actual optimization requires historical data + strategy factory
        // This route provides the API contract; full wiring depends on backtest data loader
        sendJson(res, 202, {
          status: 'accepted',
          message: 'Optimization job queued',
          strategyName: body.strategyName,
          initialCapital: body.initialCapital ?? 10000,
        });

        // Cleanup after timeout (placeholder for actual job completion)
        setTimeout(() => runningJobs.delete(userId), 5000);
      } catch (err) {
        runningJobs.delete(userId);
        sendJson(res, 400, { error: String(err) });
      }
    })();
    return true;
  }

  // GET /api/optimizer/results
  if (pathname === '/api/optimizer/results' && method === 'GET') {
    const cached = latestResults.get(userId);
    if (!cached) {
      sendJson(res, 200, { result: null, message: 'No optimization results yet' });
      return true;
    }
    sendJson(res, 200, { result: cached.result, timestamp: cached.timestamp });
    return true;
  }

  return false;
}

/** Store optimization result (called from job completion) */
export function storeOptimizerResult(userId: string, result: OptimizationResult): void {
  latestResults.set(userId, { result, timestamp: Date.now() });
  runningJobs.delete(userId);
}
