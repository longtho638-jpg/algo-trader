/**
 * TradeMonitorService Tests
 *
 * Tests for trade metrics tracking and anomaly detection.
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { TradeMonitorServiceImpl, getGlobalTradeMonitor, resetGlobalTradeMonitor } from './trade-monitor-service';

describe('TradeMonitorService', () => {
  let monitor: TradeMonitorServiceImpl;

  beforeEach(() => {
    resetGlobalTradeMonitor();
    monitor = new TradeMonitorServiceImpl();
  });

  test('should initialize with empty metrics', () => {
    const metrics = monitor.getMetrics(3600000);
    expect(metrics.totalTrades).toBe(0);
    expect(metrics.successRate).toBe(0);
    expect(metrics.errorRate).toBe(0);
    expect(metrics.latency.avg).toBe(0);
    expect(metrics.latency.p50).toBe(0);
    expect(metrics.latency.p95).toBe(0);
    expect(metrics.latency.p99).toBe(0);
  });

  test('should record trade and calculate metrics', () => {
    monitor.recordTrade({ latencyMs: 100, success: true, tenantId: 'tenant-1' });

    const metrics = monitor.getMetrics(3600000);
    expect(metrics.totalTrades).toBe(1);
    expect(metrics.successRate).toBe(1);
    expect(metrics.errorRate).toBe(0);
  });

  test('should calculate success rate correctly', () => {
    monitor.recordTrade({ latencyMs: 100, success: true });
    monitor.recordTrade({ latencyMs: 150, success: true });
    monitor.recordTrade({ latencyMs: 200, success: false });
    monitor.recordTrade({ latencyMs: 120, success: true });

    const metrics = monitor.getMetrics(3600000);
    expect(metrics.totalTrades).toBe(4);
    expect(metrics.successRate).toBe(0.75);
    expect(metrics.errorRate).toBe(0.25);
  });

  test('should calculate latency percentiles correctly', () => {
    // Record 100 trades with known latencies
    for (let i = 1; i <= 100; i++) {
      monitor.recordTrade({ latencyMs: i * 10, success: true });
    }

    const metrics = monitor.getMetrics(3600000);
    // p50 should be around 50th value (500ms)
    expect(metrics.latency.p50).toBe(500);
    // p95 should be around 95th value (950ms)
    expect(metrics.latency.p95).toBe(950);
    // p99 should be around 99th value (990ms)
    expect(metrics.latency.p99).toBe(990);
  });

  test('should handle empty latency array', () => {
    const metrics = monitor.getMetrics(3600000);
    expect(metrics.latency.avg).toBe(0);
    expect(metrics.latency.p50).toBe(0);
    expect(metrics.latency.p95).toBe(0);
    expect(metrics.latency.p99).toBe(0);
  });

  test('should filter metrics by time window', () => {
    jest.useFakeTimers();
    const now = Date.now();
    jest.setSystemTime(now);

    // Record trades at different times
    monitor.recordTrade({ latencyMs: 100, success: true, tenantId: 't1' }); // now

    jest.setSystemTime(now + 2000); // 2 seconds later
    monitor.recordTrade({ latencyMs: 200, success: true, tenantId: 't1' });

    jest.setSystemTime(now + 5000); // 5 seconds later
    monitor.recordTrade({ latencyMs: 300, success: true, tenantId: 't1' });

    // Get metrics for last 3 seconds (should only include trades 2 and 3)
    const metrics = monitor.getMetrics(3000);
    expect(metrics.totalTrades).toBe(2);

    jest.useRealTimers();
  });

  test('should get anomalies since timestamp', () => {
    const anomalies = monitor.getAnomalies(3600000);
    expect(Array.isArray(anomalies)).toBe(true);
  });

  test('getGlobalTradeMonitor should return singleton', () => {
    const monitor1 = getGlobalTradeMonitor();
    const monitor2 = getGlobalTradeMonitor();
    expect(monitor1).toBe(monitor2);
  });
});

describe('AnomalyDetector', () => {
  test('should detect latency anomaly for FREE tier', () => {
    const { AnomalyDetectorImpl } = require('./anomaly-detector');
    const detector = new AnomalyDetectorImpl();

    const anomaly = detector.detectLatencyAnomaly(6000, 't1', 'free');
    expect(anomaly).not.toBeNull();
    expect(anomaly?.type).toBe('latency');
  });

  test('should not trigger anomaly for normal latency', () => {
    const { AnomalyDetectorImpl } = require('./anomaly-detector');
    const detector = new AnomalyDetectorImpl();

    const anomaly = detector.detectLatencyAnomaly(500, 't1', 'free');
    expect(anomaly).toBeNull();
  });

  test('should detect critical severity for extreme latency', () => {
    const { AnomalyDetectorImpl } = require('./anomaly-detector');
    const detector = new AnomalyDetectorImpl();

    // 12000ms / 5000ms threshold = 2.4x → high severity (not critical yet)
    const anomaly = detector.detectLatencyAnomaly(12000, 't1', 'free');
    expect(anomaly).not.toBeNull();
    expect(anomaly?.severity).toBe('high');
  });

  test('should detect error rate anomaly', () => {
    const { AnomalyDetectorImpl } = require('./anomaly-detector');
    const detector = new AnomalyDetectorImpl();

    const anomaly = detector.detectErrorRateAnomaly(0.1, 't1', 'free');
    expect(anomaly).not.toBeNull();
    expect(anomaly?.type).toBe('error_spike');
  });
});

describe('Tier-based Thresholds', () => {
  test('should have different thresholds per tier', () => {
    const { AnomalyDetectorImpl } = require('./anomaly-detector');
    const detector = new AnomalyDetectorImpl();

    const freeThresholds = detector.getAllTierThresholds();

    // FREE tier should have higher (more lenient) thresholds than ENTERPRISE
    expect(freeThresholds.free.latencyMs).toBeGreaterThan(freeThresholds.enterprise.latencyMs);
    expect(freeThresholds.free.errorRate).toBeGreaterThan(freeThresholds.enterprise.errorRate);
  });

  test('should have strict ENTERPRISE thresholds', () => {
    const { AnomalyDetectorImpl } = require('./anomaly-detector');
    const detector = new AnomalyDetectorImpl();

    const thresholds = detector.getAllTierThresholds();

    // ENTERPRISE should have the strictest thresholds
    expect(thresholds.enterprise.latencyMs).toBe(1000);
    expect(thresholds.enterprise.errorRate).toBe(0.01);
  });
});
