// Strategy template API routes for algo-trade RaaS platform
// GET /api/templates — list all templates
// GET /api/templates/search?q=... — search templates
// GET /api/templates/:id — get template by ID

import type { IncomingMessage, ServerResponse } from 'node:http';
import { parse } from 'node:url';
import { sendJson } from './http-response-helpers.js';
import type { AuthenticatedRequest } from './auth-middleware.js';
import { registry } from '../templates/template-registry.js';
import { ALL_TEMPLATES } from '../templates/built-in-templates.js';

// Auto-register built-in templates on first import
let _initialized = false;
function ensureInit(): void {
  if (_initialized) return;
  for (const t of ALL_TEMPLATES) registry.register(t);
  _initialized = true;
}

export function handleTemplateRoutes(
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

  ensureInit();

  // GET /api/templates
  if (pathname === '/api/templates' && method === 'GET') {
    const templates = registry.listAll();
    sendJson(res, 200, { templates, count: templates.length });
    return true;
  }

  // GET /api/templates/search?q=...
  if (pathname === '/api/templates/search' && method === 'GET') {
    const parsed = parse(req.url ?? '/', true);
    const q = String(parsed.query['q'] ?? '');
    const results = registry.search(q);
    sendJson(res, 200, { results, count: results.length, query: q });
    return true;
  }

  // GET /api/templates/:id
  const idMatch = pathname.match(/^\/api\/templates\/([a-zA-Z0-9_-]+)$/);
  if (idMatch && method === 'GET') {
    const id = idMatch[1];
    const template = registry.getById(id);
    if (!template) {
      sendJson(res, 404, { error: `Template '${id}' not found` });
      return true;
    }
    sendJson(res, 200, { template });
    return true;
  }

  return false;
}
