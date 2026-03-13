/**
 * Monitoring Module — Trade Metrics & Anomaly Detection
 *
 * Provides real-time monitoring for trade execution:
 * - Latency percentiles (p50, p95, p99)
 * - Error rate tracking
 * - Tier-based anomaly detection
 * - Prometheus metrics export
 * - Webhook alerts for anomalies and usage thresholds
 * - License compliance tracking
 * - Rate limit observability
 * - Billing events tracking
 * - P&L monitoring with event emission
 * - Position lifecycle tracking
 * - Threshold-based alerts
 *
 * @example
 * ```typescript
 * import { getGlobalTradeMonitor, AnomalyDetector, PrometheusExporter, MetricsWebhookSender } from './monitoring';
 * import { getGlobalPnlMonitor, getGlobalPositionTracker, getGlobalAlertManager } from './monitoring';
 *
 * const monitor = getGlobalTradeMonitor();
 * monitor.recordTrade({ id: '1', tenantId: 'tenant-123', success: true }, 150);
 *
 * const pnlMonitor = getGlobalPnlMonitor();
 * pnlMonitor.on('pnl:update', (event) => console.log(event.summary));
 * pnlMonitor.start();
 *
 * const positionTracker = getGlobalPositionTracker();
 * positionTracker.on('position:opened', (event) => console.log(event.position));
 *
 * const alertManager = getGlobalAlertManager();
 * alertManager.addAlert('daily_loss', -500, (alert) => console.warn(alert.message));
 * ```
 */

export * from './trade-monitor-service';
export * from './anomaly-detector';
export * from './prometheus-exporter';
export * from './metrics-webhook-sender';
export * from './license-compliance-tracker';
export * from './rate-limit-tracker';
export * from './billing-events-tracker';
export * from './pnl-monitor-service';
export * from './position-tracker';
export * from './alert-manager';
