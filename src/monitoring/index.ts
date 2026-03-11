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
 *
 * @example
 * ```typescript
 * import { getGlobalTradeMonitor, AnomalyDetector, PrometheusExporter, MetricsWebhookSender } from './monitoring';
 *
 * const monitor = getGlobalTradeMonitor();
 * monitor.recordTrade({ id: '1', tenantId: 'tenant-123', success: true }, 150);
 *
 * const exporter = new PrometheusExporter();
 * exporter.recordLatency(150, { tenant: 'tenant-123', endpoint: '/api/v1/arb/execute', success: 'true' });
 *
 * const sender = new MetricsWebhookSender({ webhookUrl, webhookSecret });
 * await sender.sendAnomalyAlert(anomalyEvent);
 * ```
 */

export * from './trade-monitor-service';
export * from './anomaly-detector';
export * from './prometheus-exporter';
export * from './metrics-webhook-sender';
export * from './license-compliance-tracker';
export * from './rate-limit-tracker';
export * from './billing-events-tracker';
