// Scaling/instance management API routes for algo-trade RaaS platform
// GET /api/instances — list all trading instances
// GET /api/instances/:id — get specific instance status
// POST /api/instances — create new trading instance
// DELETE /api/instances/:id — stop and remove instance
// Enterprise tier required

import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendJson, readJsonBody } from './http-response-helpers.js';
import type { AuthenticatedRequest } from './auth-middleware.js';
import type { InstanceManager } from '../scaling/instance-manager.js';
import type { StrategyName } from '../core/types.js';

let _instanceManager: InstanceManager | null = null;
export function setInstanceManager(mgr: InstanceManager): void { _instanceManager = mgr; }

export function handleScalingRoutes(
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

  if (user.tier !== 'enterprise') {
    sendJson(res, 403, { error: 'Enterprise tier required for instance management' });
    return true;
  }

  if (!_instanceManager) {
    sendJson(res, 503, { error: 'Instance manager not configured' });
    return true;
  }

  // GET /api/instances
  if (pathname === '/api/instances' && method === 'GET') {
    const instances = _instanceManager.listInstances();
    sendJson(res, 200, { instances, count: instances.length });
    return true;
  }

  // GET /api/instances/:id
  const detailMatch = pathname.match(/^\/api\/instances\/([^/]+)$/);
  if (detailMatch && method === 'GET') {
    try {
      const status = _instanceManager.getInstanceStatus(detailMatch[1]!);
      sendJson(res, 200, { instance: status });
    } catch (err) {
      sendJson(res, 404, { error: err instanceof Error ? err.message : 'Not found' });
    }
    return true;
  }

  // POST /api/instances
  if (pathname === '/api/instances' && method === 'POST') {
    void (async () => {
      try {
        const body = await readJsonBody(req);
        const id = String(body['id'] ?? `inst-${Date.now()}`);
        const strategies = (body['strategies'] as string[] | undefined) ?? [];
        const port = typeof body['port'] === 'number' ? body['port'] : 3010;
        const capitalAllocation = String(body['capitalAllocation'] ?? '10000');

        const status = _instanceManager!.createInstance({
          id,
          strategies: strategies as StrategyName[],
          port,
          capitalAllocation,
        });
        sendJson(res, 201, { instance: status });
      } catch (err) {
        sendJson(res, 400, { error: err instanceof Error ? err.message : 'Bad request' });
      }
    })();
    return true;
  }

  // DELETE /api/instances/:id
  if (detailMatch && method === 'DELETE') {
    void (async () => {
      try {
        await _instanceManager!.removeInstance(detailMatch[1]!);
        sendJson(res, 200, { ok: true, removed: detailMatch[1] });
      } catch (err) {
        sendJson(res, 404, { error: err instanceof Error ? err.message : 'Not found' });
      }
    })();
    return true;
  }

  return false;
}
