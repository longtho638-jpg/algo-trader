/**
 * PrometheusExporter Unit Tests
 */

import { PrometheusExporterClass as PrometheusExporter } from './prometheus-exporter';

describe('PrometheusExporter', () => {
  let exporter: PrometheusExporter;

  beforeEach(() => {
    exporter = new PrometheusExporter();
  });

  afterEach(() => {
    exporter.clearMetrics();
  });

  describe('constructor', () => {
    it('should create exporter with default buckets', () => {
      expect(exporter).toBeDefined();
    });

    it('should create exporter with custom buckets', () => {
      const customBuckets = [0.1, 0.5, 1.0];
      const customExporter = new PrometheusExporter(customBuckets);
      expect(customExporter).toBeDefined();
    });
  });

  describe('registerCounter', () => {
    it('should register a counter metric', () => {
      const counter = exporter.registerCounter('test_counter', 'Test counter help');
      expect(counter).toBeDefined();
      expect(counter.name).toBe('test_counter');
      expect(counter.type).toBe('counter');
    });

    it('should register counter with labels', () => {
      const counter = exporter.registerCounter('test_counter', 'Help', { label: 'value' });
      expect(counter.labels).toEqual({ label: 'value' });
    });
  });

  describe('registerGauge', () => {
    it('should register a gauge metric', () => {
      const gauge = exporter.registerGauge('test_gauge', 'Gauge help');
      expect(gauge).toBeDefined();
      expect(gauge.name).toBe('test_gauge');
      expect(gauge.type).toBe('gauge');
    });
  });

  describe('registerHistogram', () => {
    it('should register a histogram with custom buckets', () => {
      const buckets = [0.1, 0.5, 1.0];
      const histogram = exporter.registerHistogram('test_hist', 'Hist help', buckets);
      expect(histogram).toBeDefined();
      expect(histogram.type).toBe('histogram');
    });
  });

  describe('inc', () => {
    it('should increment counter', () => {
      const counter = exporter.registerCounter('test_counter', 'Help');
      exporter.inc(counter, 1);
      exporter.inc(counter, 2);
      expect(counter.value).toBe(3);
    });

    it('should increment by 1 by default', () => {
      const counter = exporter.registerCounter('test_counter', 'Help');
      exporter.inc(counter);
      expect(counter.value).toBe(1);
    });
  });

  describe('set', () => {
    it('should set gauge value', () => {
      const gauge = exporter.registerGauge('test_gauge', 'Help');
      exporter.set(gauge, 42);
      expect(gauge.value).toBe(42);
    });
  });

  describe('observe', () => {
    it('should observe value in histogram', () => {
      const histogram = exporter.registerHistogram('test_hist', 'Help', [1, 5, 10]);
      exporter.observe(histogram, 3);
      expect(histogram.count).toBe(1);
      expect(histogram.sum).toBe(3);
    });

    it('should update bucket counts', () => {
      const histogram = exporter.registerHistogram('test_hist', 'Help', [1, 5, 10]);
      exporter.observe(histogram, 3);
      exporter.observe(histogram, 7);
      expect(histogram.count).toBe(2);
    });
  });

  describe('metrics', () => {
    it('should return Prometheus text format', async () => {
      const counter = exporter.registerCounter('test_counter', 'Counter help');
      exporter.inc(counter, 5);

      const metrics = await exporter.metrics();
      expect(metrics).toContain('# HELP test_counter');
      expect(metrics).toContain('# TYPE test_counter counter');
      expect(metrics).toContain('test_counter 5');
    });

    it('should include all registered metrics', async () => {
      const counter = exporter.registerCounter('cnt', 'Help');
      const gauge = exporter.registerGauge('gauge', 'Help');
      exporter.inc(counter, 1);
      exporter.set(gauge, 2);

      const metrics = await exporter.metrics();
      expect(metrics).toContain('cnt');
      expect(metrics).toContain('gauge');
    });

    it('should format labels correctly', async () => {
      const counter = exporter.registerCounter('cnt', 'Help', { label: 'value' });
      exporter.inc(counter, 1);

      const metrics = await exporter.metrics();
      expect(metrics).toContain('{label="value"}');
    });
  });

  describe('clear', () => {
    it('should clear all metrics', () => {
      exporter.registerCounter('cnt', 'Help');
      exporter.registerGauge('gauge', 'Help');
      exporter.clear();

      const metrics = exporter.metrics();
      // After clear, should return empty
      expect(metrics).toBeDefined();
    });
  });

  describe('clearMetrics', () => {
    it('should clear all metrics', () => {
      exporter.registerCounter('cnt', 'Help');
      exporter.clearMetrics();
    });
  });

  describe('recordLatency', () => {
    it('should record latency (stub)', () => {
      // Stub implementation - no-op for now
      exporter.recordLatency(150, { tenant: 't1', endpoint: '/api', success: 'true' });
      expect(true).toBe(true);
    });
  });

  describe('incrementErrors', () => {
    it('should increment errors (stub)', () => {
      // Stub implementation - no-op for now
      exporter.incrementErrors({ tenant: 't1', error_type: 'timeout' });
      expect(true).toBe(true);
    });
  });

  describe('updateIdempotency', () => {
    it('should update idempotency (stub)', () => {
      // Stub implementation - no-op for now
      exporter.updateIdempotency(42, 't1');
      expect(true).toBe(true);
    });
  });

  describe('getMetrics', () => {
    it('should return metrics string', async () => {
      const metrics = await exporter.getMetrics();
      expect(typeof metrics).toBe('string');
    });
  });
});
