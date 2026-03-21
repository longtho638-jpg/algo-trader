// API wiring layer — connects HTTP server routes to their service modules
// Pure orchestration: no business logic here, only routing glue.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { parse } from 'node:url';
import type { TradingEngine } from '../engine/engine.js';
import type { UserStore } from '../users/user-store.js';
import type { TenantManager } from '../users/tenant-manager.js';
import { handleRequest } from '../api/routes.js';
import { handleAdminRequest } from '../admin/admin-routes.js';
import {
  handleListStrategies,
  handleGetStrategy,
  handlePublishStrategy,
  handlePurchaseStrategy,
} from '../marketplace/marketplace-api.js';

// ---------------------------------------------------------------------------
// Dependency types
// ---------------------------------------------------------------------------

export interface ApiDependencies {
  engine: TradingEngine;
  userStore: UserStore;
  tenantManager: TenantManager;
}

// ---------------------------------------------------------------------------
// Marketplace sub-router
// ---------------------------------------------------------------------------

/**
 * Route /api/marketplace/* requests to the appropriate marketplace handler.
 * Returns true if the request was handled, false if no route matched.
 */
async function routeMarketplace(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): Promise<boolean> {
  const method = req.method ?? 'GET';

  // GET /api/marketplace
  if (pathname === '/api/marketplace' && method === 'GET') {
    handleListStrategies(req, res);
    return true;
  }

  // POST /api/marketplace
  if (pathname === '/api/marketplace' && method === 'POST') {
    await handlePublishStrategy(req, res);
    return true;
  }

  // POST /api/marketplace/:id/purchase
  const purchaseMatch = pathname.match(/^\/api\/marketplace\/([^/]+)\/purchase$/);
  if (purchaseMatch && method === 'POST') {
    await handlePurchaseStrategy(req, res, purchaseMatch[1]!);
    return true;
  }

  // GET /api/marketplace/:id
  const detailMatch = pathname.match(/^\/api\/marketplace\/([^/]+)$/);
  if (detailMatch && method === 'GET') {
    handleGetStrategy(req, res, detailMatch[1]!);
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Unified request handler
// ---------------------------------------------------------------------------

/**
 * Build a unified Node.js request handler that dispatches to:
 *   - /admin/* → admin routes (engine + userStore)
 *   - /api/marketplace/* → marketplace routes
 *   - /api/* → main API routes (engine)
 *
 * Usage: server.on('request', createRequestHandler(deps))
 */
export function createRequestHandler(
  deps: ApiDependencies,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const parsed = parse(req.url ?? '/');
    const pathname = parsed.pathname ?? '/';

    // Admin routes
    if (pathname.startsWith('/admin')) {
      await handleAdminRequest(req, res, deps.engine, deps.userStore, pathname);
      return;
    }

    // Marketplace routes
    if (pathname.startsWith('/api/marketplace')) {
      const handled = await routeMarketplace(req, res, pathname);
      if (handled) return;
    }

    // Main API routes (health, status, trades, pnl, strategy start/stop)
    await handleRequest(req, res, deps.engine, pathname);
  };
}

// ---------------------------------------------------------------------------
// Server wiring entry point
// ---------------------------------------------------------------------------

/**
 * Wire all API routes onto an existing Node.js http.Server instance.
 * The server must already be created; this function only attaches the handler.
 */
export function wireApiRoutes(
  server: import('node:http').Server,
  deps: ApiDependencies,
): void {
  const handler = createRequestHandler(deps);
  server.on('request', handler);
}
