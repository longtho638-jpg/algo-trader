// System health aggregate endpoint — reports status of all subsystems
// GET /api/system/health — Enterprise monitoring feature

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { TradingEngine } from '../engine/engine.js';

export interface SystemHealthDeps {
  engine: TradingEngine;
  getSchedulerStatus: () => { running: boolean; jobCount: number };
  getWebhookStats: () => { pending: number; delivered: number; failed: number };
  getOpenClawStatus: () => string;
  getDbStatus: () => boolean;
}

let _deps: SystemHealthDeps | null = null;
export function setSystemHealthDeps(deps: SystemHealthDeps): void { _deps = deps; }

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

export function handleSystemHealthRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
): boolean {
  if (pathname !== '/api/system/health') return false;
  if (method !== 'GET') { sendJson(res, 405, { error: 'Method Not Allowed' }); return true; }

  if (!_deps) {
    sendJson(res, 503, { error: 'System health not configured' });
    return true;
  }

  const engineStatus = _deps.engine.getStatus();
  const scheduler = _deps.getSchedulerStatus();
  const webhooks = _deps.getWebhookStats();
  const openClaw = _deps.getOpenClawStatus();
  const dbOk = _deps.getDbStatus();

  const subsystems = {
    engine: { status: engineStatus.running ? 'healthy' : 'stopped', tradeCount: engineStatus.tradeCount, strategies: engineStatus.strategies.length },
    database: { status: dbOk ? 'healthy' : 'degraded' },
    scheduler: { status: scheduler.running ? 'healthy' : 'stopped', jobs: scheduler.jobCount },
    webhooks: { status: 'healthy', ...webhooks },
    openClaw: { status: openClaw },
  };

  const allHealthy = Object.values(subsystems).every(
    s => s.status === 'healthy' || s.status === 'configured' || s.status === 'none',
  );

  sendJson(res, allHealthy ? 200 : 503, {
    status: allHealthy ? 'healthy' : 'degraded',
    uptime: process.uptime(),
    memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    subsystems,
    timestamp: Date.now(),
  });
  return true;
}
