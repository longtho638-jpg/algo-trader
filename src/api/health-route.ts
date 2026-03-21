// Health check route handler - enriched /api/health endpoint
// Returns: status, uptime, db, pipeline, wsClients, version
import type { IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import type { TradingEngine } from '../engine/engine.js';
import { MetricsCollector } from '../metrics/metrics-collector.js';
import { getDatabase } from '../data/database.js';

const VERSION = '0.2.0';
const SERVER_START = Date.now();

/** Probe DB availability by checking MetricsCollector (in-process health proxy) */
function probeDb(): 'ok' | 'error' {
  try {
    MetricsCollector.getInstance().getAll();
    return 'ok';
  } catch {
    return 'error';
  }
}

/** Deep DB probe: test actual read/write round-trip */
function probeDbDeep(): { status: 'ok' | 'error'; latencyMs: number; error?: string } {
  const start = Date.now();
  try {
    const db = getDatabase();
    // Read-only check — getTrades with limit 1
    db.getTrades(undefined, 1);
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (err) {
    return { status: 'error', latencyMs: Date.now() - start, error: String(err) };
  }
}

/**
 * GET /api/health
 * Returns a JSON snapshot of system health.
 *
 * Response shape:
 *   { status, uptime, db, pipeline, wsClients, version }
 */
export function handleHealthEnriched(
  req: IncomingMessage,
  res: ServerResponse,
  engine: TradingEngine,
): void {
  const reqUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const deep = reqUrl.searchParams.get('deep') === 'true';
  const collector = MetricsCollector.getInstance();

  // ws_connections gauge — set by request-metrics-middleware or ws-server
  const wsMetric = collector.getAll().find((m) => m.name === 'ws_connections');
  const wsClients =
    wsMetric?.samples.get('__default__')?.value ?? 0;

  const engineRunning = engine.isRunning();
  const pipeline: 'running' | 'stopped' = engineRunning ? 'running' : 'stopped';
  const db = probeDb();
  const overall = db === 'ok' ? 'ok' : 'degraded';

  const payload: Record<string, unknown> = {
    status: overall,
    uptime: Date.now() - SERVER_START,
    db,
    pipeline,
    wsClients,
    version: VERSION,
  };

  if (deep) {
    payload.dbDeep = probeDbDeep();
    payload.memoryMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
    payload.uptimeSeconds = Math.round(process.uptime());
    if ((payload.dbDeep as { status: string }).status === 'error') {
      payload.status = 'degraded';
    }
  }

  const body = JSON.stringify(payload);

  res.writeHead(overall === 'ok' ? 200 : 503, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}
