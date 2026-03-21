// Pipeline control API routes — manages StrategyOrchestrator lifecycle via REST
// POST /api/pipeline/start                  — start all enabled strategies
// POST /api/pipeline/stop                   — stop all running strategies
// GET  /api/pipeline/status                 — return orchestrator + strategy statuses
// POST /api/pipeline/strategy/:id/start     — start a specific strategy by id
// POST /api/pipeline/strategy/:id/stop      — stop a specific strategy by id
import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendJson } from './http-response-helpers.js';
import type { StrategyOrchestrator } from '../strategies/strategy-orchestrator.js';

// Module-level orchestrator reference — set by the application bootstrap
let _orchestrator: StrategyOrchestrator | null = null;

/** Register the orchestrator instance with this route module */
export function setOrchestrator(orch: StrategyOrchestrator): void {
  _orchestrator = orch;
}

// Regex to extract strategy id from /api/pipeline/strategy/:id/start|stop
const STRATEGY_ROUTE_RE = /^\/api\/pipeline\/strategy\/([^/]+)\/(start|stop)$/;

/**
 * Handle all /api/pipeline/* requests.
 * Returns true if the request was handled (even as an error), false for 404 fallthrough.
 */
export async function handlePipelineRoutes(
  _req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
): Promise<boolean> {
  // Guard: orchestrator must be configured
  if (!_orchestrator) {
    sendJson(res, 503, { error: 'Pipeline not configured' });
    return true;
  }

  const orch = _orchestrator;

  // POST /api/pipeline/start — start all enabled strategies
  if (pathname === '/api/pipeline/start') {
    if (method !== 'POST') { sendJson(res, 405, { error: 'Method Not Allowed' }); return true; }
    orch.startAll();
    sendJson(res, 200, { ok: true, strategies: orch.getStatus() });
    return true;
  }

  // POST /api/pipeline/stop — stop all running strategies
  if (pathname === '/api/pipeline/stop') {
    if (method !== 'POST') { sendJson(res, 405, { error: 'Method Not Allowed' }); return true; }
    const before = orch.getStatus().filter(s => s.status === 'running').length;
    orch.stopAll();
    sendJson(res, 200, { ok: true, stopped: before });
    return true;
  }

  // GET /api/pipeline/status — overall health + all strategy statuses
  if (pathname === '/api/pipeline/status') {
    if (method !== 'GET') { sendJson(res, 405, { error: 'Method Not Allowed' }); return true; }
    sendJson(res, 200, { healthy: orch.isHealthy(), strategies: orch.getStatus() });
    return true;
  }

  // POST /api/pipeline/strategy/:id/start|stop — per-strategy control
  const match = STRATEGY_ROUTE_RE.exec(pathname);
  if (match) {
    const [, strategyId, action] = match;
    if (method !== 'POST') { sendJson(res, 405, { error: 'Method Not Allowed' }); return true; }

    const ok = action === 'start' ? orch.start(strategyId) : orch.stop(strategyId);
    const strategy = orch.getStrategyStatus(strategyId);

    if (!strategy) {
      sendJson(res, 404, { error: `Strategy '${strategyId}' not found` });
      return true;
    }

    // start/stop return false if already in target state — still a 200 with current status
    sendJson(res, ok ? 200 : 200, { ok, strategy });
    return true;
  }

  // No pattern matched — let caller send 404
  return false;
}
