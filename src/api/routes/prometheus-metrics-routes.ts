/**
 * Prometheus /metrics endpoint — exposes trading metrics in text exposition format.
 * Scraped by Prometheus every 10-15s. No auth required (skipped in server bootstrap).
 */

import { FastifyInstance } from 'fastify';

interface MetricsCollector {
  getTradeCount(): number;
  getActiveTenants(): number;
  getOpenPositions(): number;
  getSpreadScansTotal(): number;
  getCircuitBreakerState(): string;
  getDailyPnlUsd(): number;
}

let collector: MetricsCollector | null = null;

/** Register an external metrics source (call once at server startup). */
export function registerMetricsCollector(c: MetricsCollector): void {
  collector = c;
}

function formatGauge(name: string, help: string, value: number | string): string {
  return `# HELP ${name} ${help}\n# TYPE ${name} gauge\n${name} ${value}\n`;
}

function formatCounter(name: string, help: string, value: number): string {
  return `# HELP ${name} ${help}\n# TYPE ${name} counter\n${name} ${value}\n`;
}

export async function prometheusMetricsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/metrics', async (_req, reply) => {
    const lines: string[] = [];

    // Process metrics (always available)
    const memUsage = process.memoryUsage();
    lines.push(formatGauge('algo_trader_heap_used_bytes', 'Heap memory used in bytes', memUsage.heapUsed));
    lines.push(formatGauge('algo_trader_heap_total_bytes', 'Heap memory total in bytes', memUsage.heapTotal));
    lines.push(formatGauge('algo_trader_rss_bytes', 'Resident set size in bytes', memUsage.rss));
    lines.push(formatGauge('algo_trader_uptime_seconds', 'Process uptime in seconds', Math.floor(process.uptime())));
    lines.push(formatGauge('algo_trader_event_loop_lag_ms', 'Event loop lag estimate', 0));

    // Trading metrics (if collector registered)
    if (collector) {
      lines.push(formatCounter('algo_trader_trades_total', 'Total trades executed', collector.getTradeCount()));
      lines.push(formatGauge('algo_trader_active_tenants', 'Currently active tenants', collector.getActiveTenants()));
      lines.push(formatGauge('algo_trader_open_positions', 'Currently open positions', collector.getOpenPositions()));
      lines.push(formatCounter('algo_trader_spread_scans_total', 'Total spread scans performed', collector.getSpreadScansTotal()));
      lines.push(formatGauge('algo_trader_circuit_breaker_state', 'Circuit breaker: 0=closed, 1=open, 2=half_open',
        collector.getCircuitBreakerState() === 'closed' ? 0 : collector.getCircuitBreakerState() === 'open' ? 1 : 2));
      lines.push(formatGauge('algo_trader_daily_pnl_usd', 'Daily P&L in USD', collector.getDailyPnlUsd()));
    }

    return reply
      .status(200)
      .header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
      .send(lines.join('\n'));
  });
}
