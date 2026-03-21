// Swagger UI + OpenAPI spec routes for /api/docs sub-tree
// Delegates to createDocsHandler() from api-docs/swagger-ui.ts
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createDocsHandler } from '../api-docs/swagger-ui.js';

// Lazy-init: handler is created once and reused (memoizes spec + HTML)
let _handler: ReturnType<typeof createDocsHandler> | undefined;

function getHandler(): ReturnType<typeof createDocsHandler> {
  if (!_handler) _handler = createDocsHandler();
  return _handler;
}

/**
 * Handles /api/docs and /api/docs/openapi.json routes.
 *
 * Routes:
 *   GET /api/docs              → Swagger UI HTML
 *   GET /api/docs/openapi.json → Raw OpenAPI 3.0 spec (JSON)
 *
 * Returns true if the route was handled, false otherwise.
 */
export function handleDocsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): boolean {
  if (pathname !== '/api/docs' && pathname !== '/api/docs/openapi.json') {
    return false;
  }

  // Remap /api/docs* → /docs* so the existing handler matches its patterns
  const remapped = pathname.replace('/api/docs', '/docs');
  getHandler()(req, res, remapped);
  return true;
}
