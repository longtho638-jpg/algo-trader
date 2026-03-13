/**
 * AlertManager — Threshold-based alert system
 *
 * Features: addAlert(condition, threshold, handler), checkAlerts(stats)
 * Thresholds: daily_loss, position_size, pnl_target, exposure_limit
 * Sub-100ms alert trigger latency with 5s cooldown
 */

import { type PortfolioSummary } from '../core/PortfolioManager';
import { logger } from '../utils/logger';
import { EventEmitter } from 'events';
import type { AlertCondition, AlertSeverity, AlertConfig, AlertHandler, AlertTriggered } from './alert-manager-types';

export * from './alert-manager-types';

const METRIC_MAP: Record<AlertCondition, keyof PortfolioSummary | null> = {
  daily_loss: 'totalPnl', position_size: 'totalPositions', pnl_target: 'totalPnl',
  exposure_limit: 'totalExposure', win_rate: null, drawdown: null, custom: null,
};

const BREACH_FN: Record<AlertCondition, (v: number, t: number) => boolean> = {
  daily_loss: (v, t) => v < t, pnl_target: (v, t) => v >= t,
  position_size: (v, t) => v > t, exposure_limit: (v, t) => v > t,
  win_rate: (v, t) => v < t, drawdown: (v, t) => v > t, custom: (v) => v !== 0,
};

export class AlertManager extends EventEmitter {
  private alerts = new Map<string, AlertConfig>();
  private triggeredHistory: AlertTriggered[] = [];
  private lastTriggered = new Map<string, number>();
  private readonly cooldownMs = 5000;

  addAlert(condition: AlertCondition, threshold: number, handler: AlertHandler,
    options?: Partial<Omit<AlertConfig, 'condition' | 'threshold' | 'handler' | 'enabled'>>): string {
    const id = `alert_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    this.alerts.set(id, { id, condition, threshold, handler, severity: options?.severity || 'warning',
      description: options?.description, enabled: true });
    logger.info(`AlertManager: Added ${id} - ${condition} ${threshold}`);
    return id;
  }

  removeAlert(alertId: string): boolean { return this.alerts.delete(alertId); }
  setAlertEnabled(alertId: string, enabled: boolean): void {
    const alert = this.alerts.get(alertId);
    if (alert) alert.enabled = enabled;
  }

  checkAlerts(stats: PortfolioSummary): AlertTriggered[] {
    const triggered: AlertTriggered[] = [];
    for (const [, alert] of this.alerts) {
      if (!alert.enabled) continue;
      const result = this.evaluateAlert(alert, stats);
      if (result) triggered.push(result);
    }
    return triggered;
  }

  getActiveAlerts(): AlertConfig[] { return Array.from(this.alerts.values()).filter(a => a.enabled); }
  getHistory(limit = 50): AlertTriggered[] { return this.triggeredHistory.slice(-limit); }

  private evaluateAlert(alert: AlertConfig, stats: PortfolioSummary): AlertTriggered | null {
    const metricKey = METRIC_MAP[alert.condition];
    const currentValue = metricKey ? stats[metricKey] ?? 0 : 0;
    if (!BREACH_FN[alert.condition](currentValue, alert.threshold)) return null;

    const now = Date.now();
    const last = this.lastTriggered.get(alert.id) || 0;
    if (now - last < this.cooldownMs) return null;

    const triggered: AlertTriggered = {
      alertId: alert.id, condition: alert.condition, severity: alert.severity,
      threshold: alert.threshold, currentValue, message: this.formatMessage(alert, currentValue),
      timestamp: now,
    };

    this.executeHandler(alert, triggered);
    this.lastTriggered.set(alert.id, now);
    this.triggeredHistory.push(triggered);
    if (this.triggeredHistory.length > 500) this.triggeredHistory = this.triggeredHistory.slice(-500);

    this.emit('alert:triggered', triggered);
    this.emit(`alert:${alert.condition}`, triggered);
    logger.warn(`AlertManager: ${alert.severity.toUpperCase()} - ${alert.description || alert.condition}: ${currentValue.toFixed(4)} breached ${alert.threshold}`);
    return triggered;
  }

  private formatMessage(alert: AlertConfig, value: number): string {
    const msgs: Record<AlertCondition, string> = {
      daily_loss: `Daily loss ${value.toFixed(4)} exceeded ${alert.threshold}`,
      position_size: `Position count ${value} exceeded ${alert.threshold}`,
      pnl_target: `P&L ${value.toFixed(4)} reached target ${alert.threshold}`,
      exposure_limit: `Exposure ${value.toFixed(4)} exceeded ${alert.threshold}`,
      win_rate: `Win rate below ${alert.threshold}`,
      drawdown: `Drawdown exceeded ${alert.threshold}`,
      custom: alert.description || 'Custom alert triggered',
    };
    return msgs[alert.condition];
  }

  private async executeHandler(alert: AlertConfig, triggered: AlertTriggered): Promise<void> {
    try { await Promise.resolve(alert.handler(triggered)); }
    catch (error) { logger.error(`AlertManager: Handler error for ${alert.id}`, error); }
  }

  reset(): void { this.alerts.clear(); this.triggeredHistory = []; this.lastTriggered.clear(); this.removeAllListeners(); }
}

let globalAlertManager: AlertManager | null = null;
export function getGlobalAlertManager(): AlertManager {
  if (!globalAlertManager) globalAlertManager = new AlertManager();
  return globalAlertManager;
}
export function resetGlobalAlertManager(): void { globalAlertManager?.reset(); globalAlertManager = null; }
