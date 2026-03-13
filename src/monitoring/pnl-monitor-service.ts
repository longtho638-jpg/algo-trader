/**
 * PnlMonitorService — Real-time P&L polling and event emission
 *
 * Features:
 * - Polls PortfolioManager at configurable intervals (1-2 seconds)
 * - Emits events: pnl:update, pnl:snapshot
 * - Event emitter pattern for real-time dashboard integration
 *
 * @module monitoring
 */

import { PortfolioManager, type PortfolioSummary } from '../core/PortfolioManager';
import { logger } from '../utils/logger';
import { EventEmitter } from 'events';

/**
 * P&L update event payload
 */
export interface PnlUpdateEvent {
  tenantId: string;
  summary: PortfolioSummary;
  timestamp: number;
}

/**
 * P&L monitor configuration
 */
export interface PnlMonitorConfig {
  pollingIntervalMs: number;
  tenantId?: string;
}

/**
 * PnlMonitorService — Real-time P&L polling with event emission
 */
export class PnlMonitorService extends EventEmitter {
  private portfolioManager: PortfolioManager;
  private config: PnlMonitorConfig;
  private pollingTimer: NodeJS.Timeout | null = null;
  private lastSnapshot: Map<string, PortfolioSummary> = new Map();

  constructor(
    portfolioManager: PortfolioManager,
    config: PnlMonitorConfig = { pollingIntervalMs: 1500 }
  ) {
    super();
    this.portfolioManager = portfolioManager;
    this.config = config;
  }

  /**
   * Start polling P&L at configured interval
   */
  start(): void {
    if (this.pollingTimer) {
      logger.warn('PnlMonitorService: Already running');
      return;
    }

    logger.info(`PnlMonitorService: Starting with ${this.config.pollingIntervalMs}ms interval`);
    this.poll();
    this.pollingTimer = setInterval(() => this.poll(), this.config.pollingIntervalMs);
  }

  /**
   * Stop polling
   */
  stop(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
      logger.info('PnlMonitorService: Stopped');
    }
  }

  /**
   * Get current P&L snapshot for tenant
   */
  getSnapshot(tenantId?: string): PortfolioSummary | null {
    const tid = tenantId || this.config.tenantId || '';
    return this.lastSnapshot.get(tid) || null;
  }

  /**
   * Poll P&L from PortfolioManager and emit events
   */
  private poll(): void {
    const tenantId = this.config.tenantId || '';

    try {
      const summary = this.portfolioManager.getPortfolioSummary(tenantId);
      const previous = this.lastSnapshot.get(tenantId);

      // Emit snapshot event every poll
      this.emit('pnl:snapshot', {
        tenantId,
        summary,
        timestamp: Date.now(),
      } as PnlUpdateEvent);

      // Emit update event only if P&L changed
      if (!previous || this.hasPnlChanged(previous, summary)) {
        this.emit('pnl:update', {
          tenantId,
          summary,
          timestamp: Date.now(),
        } as PnlUpdateEvent);

        logger.debug(
          `PnlMonitorService: P&L update for ${tenantId}: ` +
          `Total=${summary.totalPnl.toFixed(4)}, Realized=${summary.realizedPnl.toFixed(4)}, ` +
          `Unrealized=${summary.unrealizedPnl.toFixed(4)}`
        );
      }

      this.lastSnapshot.set(tenantId, summary);
    } catch (error) {
      logger.error('PnlMonitorService: Failed to poll P&L', error);
    }
  }

  /**
   * Check if P&L has changed significantly (>0.01%)
   */
  private hasPnlChanged(prev: PortfolioSummary, curr: PortfolioSummary): boolean {
    const threshold = 0.0001; // 0.01%
    const prevTotal = Math.abs(prev.totalPnl);
    const currTotal = Math.abs(curr.totalPnl);

    if (prevTotal < 0.0001 && currTotal < 0.0001) return false;
    if (prevTotal < 0.0001 || currTotal < 0.0001) return true;

    const change = Math.abs(currTotal - prevTotal) / prevTotal;
    return change > threshold;
  }

  /**
   * Reset state (for testing)
   */
  reset(): void {
    this.stop();
    this.lastSnapshot.clear();
    this.removeAllListeners();
  }
}

/**
 * Global monitor instance
 */
let globalPnlMonitor: PnlMonitorService | null = null;

export function getGlobalPnlMonitor(
  portfolioManager?: PortfolioManager,
  config?: PnlMonitorConfig
): PnlMonitorService {
  if (!globalPnlMonitor) {
    if (!portfolioManager) {
      portfolioManager = PortfolioManager.getInstance();
    }
    globalPnlMonitor = new PnlMonitorService(portfolioManager, config);
  }
  return globalPnlMonitor;
}

/**
 * Reset global instance (for testing)
 */
export function resetGlobalPnlMonitor(): void {
  globalPnlMonitor?.reset();
  globalPnlMonitor = null;
}
