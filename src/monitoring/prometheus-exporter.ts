/**
 * Prometheus Exporter - Metrics Export for Prometheus
 *
 * Exposes trade metrics in Prometheus format:
 * - Trade counters (total, success, failed)
 * - Latency histograms
 * - Error rate gauges
 * - Anomaly counters
 *
 * Format: https://prometheus.io/docs/instrumenting/exposition_formats/
 */

export interface MetricLabels {
  [key: string]: string | number;
}

export interface HistogramMetric {
  name: string;
  help: string;
  type: 'histogram';
  buckets: Map<string, number>;
  sum: number;
  count: number;
  labels?: MetricLabels;
}

export interface CounterMetric {
  name: string;
  help: string;
  type: 'counter';
  value: number;
  labels?: MetricLabels;
}

export interface GaugeMetric {
  name: string;
  help: string;
  type: 'gauge';
  value: number;
  labels?: MetricLabels;
}

export interface PrometheusExporter {
  registerCounter(name: string, help: string, labels?: MetricLabels): CounterMetric;
  registerGauge(name: string, help: string, labels?: MetricLabels): GaugeMetric;
  registerHistogram(
    name: string,
    help: string,
    buckets: number[],
    labels?: MetricLabels
  ): HistogramMetric;
  inc(counter: CounterMetric, value?: number): void;
  set(gauge: GaugeMetric, value: number): void;
  observe(histogram: HistogramMetric, value: number): void;
  metrics(): Promise<string>;
  clear(): void;

  // Convenience methods
  recordLatency(ms: number, labels?: { tenant?: string; endpoint?: string; success?: string }): void;
  incrementErrors(labels?: { tenant?: string; error_type?: string; endpoint?: string }): void;
  updateIdempotency(count: number, tenant?: string): void;
  getMetrics(): Promise<string>;
  clearMetrics(): void;
}

class PrometheusExporterImpl implements PrometheusExporter {
  private counters: CounterMetric[] = [];
  private gauges: GaugeMetric[] = [];
  private histograms: HistogramMetric[] = [];
  private histogramBuckets: number[];

  constructor(buckets?: number[]) {
    this.histogramBuckets = buckets || [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
  }

  registerCounter(name: string, help: string, labels?: MetricLabels): CounterMetric {
    const counter: CounterMetric = {
      name,
      help,
      type: 'counter',
      value: 0,
      labels,
    };
    this.counters.push(counter);
    return counter;
  }

  registerGauge(name: string, help: string, labels?: MetricLabels): GaugeMetric {
    const gauge: GaugeMetric = {
      name,
      help,
      type: 'gauge',
      value: 0,
      labels,
    };
    this.gauges.push(gauge);
    return gauge;
  }

  registerHistogram(
    name: string,
    help: string,
    buckets: number[],
    labels?: MetricLabels
  ): HistogramMetric {
    const bucketMap = new Map<string, number>();
    buckets.forEach((bucket, i) => {
      bucketMap.set(i === buckets.length - 1 ? '+Inf' : bucket.toString(), 0);
    });

    const histogram: HistogramMetric = {
      name,
      help,
      type: 'histogram',
      buckets: bucketMap,
      sum: 0,
      count: 0,
      labels,
    };
    this.histograms.push(histogram);
    return histogram;
  }

  inc(counter: CounterMetric, value: number = 1): void {
    counter.value += value;
  }

  set(gauge: GaugeMetric, value: number): void {
    gauge.value = value;
  }

  observe(histogram: HistogramMetric, value: number): void {
    histogram.sum += value;
    histogram.count += 1;

    // Update bucket counts
    const sortedBuckets = Array.from(histogram.buckets.keys())
      .filter(k => k !== '+Inf')
      .map(Number)
      .sort((a, b) => a - b);

    let cumulative = 0;
    for (const bucket of sortedBuckets) {
      if (value <= bucket) {
        cumulative += 1;
      }
      histogram.buckets.set(bucket.toString(), cumulative);
    }
    // +Inf bucket always equals total count
    histogram.buckets.set('+Inf', histogram.count);
  }

  async metrics(): Promise<string> {
    const lines: string[] = [];

    // Counters
    for (const counter of this.counters) {
      lines.push(`# HELP ${counter.name} ${counter.help}`);
      lines.push(`# TYPE ${counter.name} counter`);
      const labelStr = counter.labels ? this.formatLabels(counter.labels) : '';
      lines.push(`${counter.name}${labelStr} ${counter.value}`);
    }

    // Gauges
    for (const gauge of this.gauges) {
      lines.push(`# HELP ${gauge.name} ${gauge.help}`);
      lines.push(`# TYPE ${gauge.name} gauge`);
      const labelStr = gauge.labels ? this.formatLabels(gauge.labels) : '';
      lines.push(`${gauge.name}${labelStr} ${gauge.value}`);
    }

    // Histograms
    for (const histogram of this.histograms) {
      lines.push(`# HELP ${histogram.name} ${histogram.help}`);
      lines.push(`# TYPE ${histogram.name} histogram`);
      const labelStr = histogram.labels ? this.formatLabels(histogram.labels) : '';

      for (const [bucket, count] of histogram.buckets.entries()) {
        lines.push(`${histogram.name}_bucket{le="${bucket}"${labelStr ? ',' : ''}${labelStr}} ${count}`);
      }
      lines.push(`${histogram.name}_sum${labelStr} ${histogram.sum}`);
      lines.push(`${histogram.name}_count${labelStr} ${histogram.count}`);
    }

    return lines.join('\n') + '\n';
  }

  clear(): void {
    this.counters = [];
    this.gauges = [];
    this.histograms = [];
  }

  clearMetrics(): void {
    this.clear();
  }

  recordLatency(ms: number, labels?: { tenant?: string; endpoint?: string; success?: string }): void {
    const histogram = this.registerHistogram(
      'trade_latency_seconds',
      'Trade latency in seconds',
      this.histogramBuckets,
      {
        tenant: labels?.tenant || 'unknown',
        endpoint: labels?.endpoint || 'unknown',
        success: labels?.success || 'unknown',
      }
    );
    this.observe(histogram, ms / 1000);
  }

  incrementErrors(labels?: { tenant?: string; error_type?: string; endpoint?: string }): void {
    const counter = this.registerCounter(
      'trade_errors_total',
      'Total trade errors',
      {
        tenant: labels?.tenant || 'unknown',
        error_type: labels?.error_type || 'unknown',
        endpoint: labels?.endpoint || 'unknown',
      }
    );
    this.inc(counter, 1);
  }

  updateIdempotency(count: number, tenant?: string): void {
    const gauge = this.registerGauge(
      'idempotency_cache_size',
      'Idempotency cache size',
      { tenant: tenant || 'unknown' }
    );
    this.set(gauge, count);
  }

  async getMetrics(): Promise<string> {
    return this.metrics();
  }

  private formatLabels(labels: MetricLabels): string {
    const parts = Object.entries(labels).map(([key, value]) => `${key}="${value}"`);
    return parts.length > 0 ? `{${parts.join(',')}}` : '';
  }
}

// Export class for testing
export class PrometheusExporterClass extends PrometheusExporterImpl {}

// Singleton instance
let globalPrometheusExporter: PrometheusExporterImpl | null = null;

export function getGlobalPrometheusExporter(): PrometheusExporter {
  if (!globalPrometheusExporter) {
    globalPrometheusExporter = new PrometheusExporterImpl();
  }
  return globalPrometheusExporter;
}

/**
 * Reset singleton (for testing)
 */
export function resetGlobalPrometheusExporter(): void {
  globalPrometheusExporter = null;
}
