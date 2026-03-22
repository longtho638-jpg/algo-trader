// Plugin management API routes for algo-trade RaaS platform
// GET /api/plugins — list all registered plugins
// POST /api/plugins/:name/enable — enable a plugin
// POST /api/plugins/:name/disable — disable a plugin
// Enterprise tier required for plugin management

import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendJson } from './http-response-helpers.js';
import type { AuthenticatedRequest } from './auth-middleware.js';
import type { PluginRegistry } from '../plugins/plugin-registry.js';

let _registry: PluginRegistry | null = null;
export function setPluginRegistry(registry: PluginRegistry): void { _registry = registry; }

export function handlePluginRoutes(
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

  // Enterprise-only feature
  if (user.tier !== 'enterprise') {
    sendJson(res, 403, { error: 'Enterprise tier required for plugin management' });
    return true;
  }

  if (!_registry) {
    sendJson(res, 503, { error: 'Plugin system not configured' });
    return true;
  }

  // GET /api/plugins
  if (pathname === '/api/plugins' && method === 'GET') {
    const plugins = _registry.listPlugins();
    sendJson(res, 200, { plugins, count: plugins.length });
    return true;
  }

  // POST /api/plugins/:name/enable
  const enableMatch = pathname.match(/^\/api\/plugins\/([^/]+)\/enable$/);
  if (enableMatch && method === 'POST') {
    const name = decodeURIComponent(enableMatch[1]!);
    try {
      _registry.enable(name);
      sendJson(res, 200, { ok: true, plugin: name, enabled: true });
    } catch (err) {
      sendJson(res, 404, { error: err instanceof Error ? err.message : 'Plugin not found' });
    }
    return true;
  }

  // POST /api/plugins/:name/disable
  const disableMatch = pathname.match(/^\/api\/plugins\/([^/]+)\/disable$/);
  if (disableMatch && method === 'POST') {
    const name = decodeURIComponent(disableMatch[1]!);
    try {
      _registry.disable(name);
      sendJson(res, 200, { ok: true, plugin: name, enabled: false });
    } catch (err) {
      sendJson(res, 404, { error: err instanceof Error ? err.message : 'Plugin not found' });
    }
    return true;
  }

  return false;
}
