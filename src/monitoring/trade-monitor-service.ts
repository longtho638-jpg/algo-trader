/**
 * Trade Monitor Service - Real-time Trade Metrics & Anomaly Detection
 *
 * Collects and aggregates trade execution metrics:
 * - Total trades, success rate, error rate
 * - Latency percentiles (p50, p95, p99)
 * - Anomaly detection integration
 *
 * Thread-safe with in-memory storage (per-process)
 */

import type { AnomalyEvent } from './anomaly-detector';

export interface TradeMetrics {
  totalTrades: number;
  successRate: number;
  latency: {
    avg: number;
    p50: number;
    p95: number;
    p99: number;
  };
  errorRate: number;
  anomalies: AnomalyEvent[];
}

export interface TradeRecord {
  timestamp: number;
  latencyMs: number;
  success: boolean;
  tenantId?: string;
  error?: string;
}

export interface TradeMonitorService {
  getMetrics(sinceMs?: number): TradeMetrics;
  getAnomalies(sinceMs?: number): AnomalyEvent[];
  recordTrade(trade: Omit<TradeRecord, 'timestamp'>): void;
  recordAnomaly(anomaly: Omit<AnomalyEvent, 'timestamp'>): void;
}

export class TradeMonitorServiceImpl implements TradeMonitorService {
  private trades: TradeRecord[] = [];
  private anomalies: AnomalyEvent[] = [];
  private readonly MAX_TRADES = 10000; // Keep last 10k trades
  private readonly MAX_ANOMALIES = 1000; // Keep last 1k anomalies

  /**
   * Record a trade execution
   */
  recordTrade(trade: Omit<TradeRecord, 'timestamp'>): void {
    const record: TradeRecord = {
      ...trade,
      timestamp: Date.now(),
    };

    this.trades.push(record);

    // Trim old trades
    if (this.trades.length > this.MAX_TRADES) {
      this.trades = this.trades.slice(-this.MAX_TRADES);
    }
  }

  /**
   * Record an anomaly event
   */
  recordAnomaly(anomaly: Omit<AnomalyEvent, 'timestamp'>): void {
    const event: AnomalyEvent = {
      ...anomaly,
      timestamp: Date.now(),
    };

    this.anomalies.push(event);

    // Trim old anomalies
    if (this.anomalies.length > this.MAX_ANOMALIES) {
      this.anomalies = this.anomalies.slice(-this.MAX_ANOMALIES);
    }
  }

  /**
   * Get aggregated metrics since specified time
   */
  getMetrics(sinceMs: number = 3600000): TradeMetrics {
    const now = Date.now();
    const cutoff = now - sinceMs;

    // Filter trades within time window
    const recentTrades = this.trades.filter(t => t.timestamp >= cutoff);

    if (recentTrades.length === 0) {
      return {
        totalTrades: 0,
        successRate: 0,
        latency: { avg: 0, p50: 0, p95: 0, p99: 0 },
        errorRate: 0,
        anomalies: this.getAnomalies(sinceMs),
      };
    }

    // Calculate success rate
    const successfulTrades = recentTrades.filter(t => t.success).length;
    const successRate = successfulTrades / recentTrades.length;

    // Calculate error rate
    const failedTrades = recentTrades.filter(t => !t.success).length;
    const errorRate = failedTrades / recentTrades.length;

    // Calculate latency percentiles
    const latencies = recentTrades
      .map(t => t.latencyMs)
      .sort((a, b) => a - b);

    const avg = latencies.reduce((sum, val) => sum + val, 0) / latencies.length;
    const p50 = this.percentile(latencies, 50);
    const p95 = this.percentile(latencies, 95);
    const p99 = this.percentile(latencies, 99);

    return {
      totalTrades: recentTrades.length,
      successRate,
      latency: { avg, p50, p95, p99 },
      errorRate,
      anomalies: this.getAnomalies(sinceMs),
    };
  }

  /**
   * Get anomaly events since specified time
   */
  getAnomalies(sinceMs: number = 3600000): AnomalyEvent[] {
    const now = Date.now();
    const cutoff = now - sinceMs;
    return this.anomalies.filter(a => a.timestamp >= cutoff);
  }

  /**
   * Calculate percentile from sorted array
   */
  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }
}

// Singleton instance
let globalTradeMonitor: TradeMonitorServiceImpl | null = null;

export function getGlobalTradeMonitor(): TradeMonitorService {
  if (!globalTradeMonitor) {
    globalTradeMonitor = new TradeMonitorServiceImpl();
  }
  return globalTradeMonitor;
}

/**
 * Reset singleton (for testing)
 */
export function resetGlobalTradeMonitor(): void {
  globalTradeMonitor = null;
}
