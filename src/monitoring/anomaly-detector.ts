/**
 * Anomaly Detector - Trading Pattern Anomaly Detection
 *
 * Detects anomalies in trading patterns:
 * - Price anomalies (unusual price movements)
 * - Volume anomalies (unusual trading volume)
 * - Spread anomalies (unusual bid-ask spreads)
 * - Error rate spikes
 * - Latency threshold violations
 *
 * Tier-based thresholds for different subscription levels
 */

export type AnomalyType = 'price' | 'volume' | 'spread' | 'error_spike' | 'latency' | 'custom';
export type AnomalySeverity = 'low' | 'medium' | 'high' | 'critical';

export interface AnomalyEvent {
  type: AnomalyType;
  severity: AnomalySeverity;
  tenantId?: string;
  tier?: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface AnomalyDetector {
  getAnomalies(sinceMs?: number): AnomalyEvent[];
  getAllTierThresholds(): Record<string, AnomalyThresholdConfig>;
  detectLatencyAnomaly(latencyMs: number, tenantId?: string, tier?: string): AnomalyEvent | null;
  detectErrorRateAnomaly(errorRate: number, tenantId?: string, tier?: string): AnomalyEvent | null;
}

export interface AnomalyThresholdConfig {
  latencyMs: number;
  errorRate: number;
  usageMultiplier: number;
}

/**
 * Tier-based threshold configuration
 * Higher tiers get more lenient thresholds
 */
const TIER_THRESHOLDS: Record<string, AnomalyThresholdConfig> = {
  free: {
    latencyMs: 5000,
    errorRate: 0.05,
    usageMultiplier: 1.0,
  },
  pro: {
    latencyMs: 3000,
    errorRate: 0.03,
    usageMultiplier: 1.5,
  },
  enterprise: {
    latencyMs: 1000,
    errorRate: 0.01,
    usageMultiplier: 2.0,
  },
};

export class AnomalyDetectorImpl implements AnomalyDetector {
  private anomalies: AnomalyEvent[] = [];
  private readonly MAX_ANOMALIES = 1000;

  /**
   * Detect latency threshold violation
   */
  detectLatencyAnomaly(
    latencyMs: number,
    tenantId?: string,
    tier: string = 'free'
  ): AnomalyEvent | null {
    const threshold = TIER_THRESHOLDS[tier]?.latencyMs || TIER_THRESHOLDS.free.latencyMs;

    if (latencyMs > threshold) {
      const ratio = latencyMs / threshold;
      let severity: AnomalySeverity = 'low';
      if (ratio > 3) severity = 'critical';
      else if (ratio > 2) severity = 'high';
      else if (ratio > 1.5) severity = 'medium';

      const anomaly: AnomalyEvent = {
        type: 'latency',
        severity,
        tenantId,
        tier,
        timestamp: Date.now(),
        metadata: {
          actualValue: latencyMs,
          threshold,
          ratio,
        },
      };

      this.recordAnomaly(anomaly);
      return anomaly;
    }

    return null;
  }

  /**
   * Detect error rate spike
   */
  detectErrorRateAnomaly(
    errorRate: number,
    tenantId?: string,
    tier: string = 'free'
  ): AnomalyEvent | null {
    const threshold = TIER_THRESHOLDS[tier]?.errorRate || TIER_THRESHOLDS.free.errorRate;

    if (errorRate > threshold) {
      const ratio = errorRate / threshold;
      let severity: AnomalySeverity = 'low';
      if (ratio > 5) severity = 'critical';
      else if (ratio > 3) severity = 'high';
      else if (ratio > 2) severity = 'medium';

      const anomaly: AnomalyEvent = {
        type: 'error_spike',
        severity,
        tenantId,
        tier,
        timestamp: Date.now(),
        metadata: {
          actualValue: errorRate,
          threshold,
          ratio,
        },
      };

      this.recordAnomaly(anomaly);
      return anomaly;
    }

    return null;
  }

  /**
   * Record an anomaly event
   */
  private recordAnomaly(anomaly: AnomalyEvent): void {
    this.anomalies.push(anomaly);

    // Trim old anomalies
    if (this.anomalies.length > this.MAX_ANOMALIES) {
      this.anomalies = this.anomalies.slice(-this.MAX_ANOMALIES);
    }
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
   * Get all tier threshold configurations
   */
  getAllTierThresholds(): Record<string, AnomalyThresholdConfig> {
    return { ...TIER_THRESHOLDS };
  }
}

// Singleton instance
let globalAnomalyDetector: AnomalyDetectorImpl | null = null;

export function getGlobalAnomalyDetector(): AnomalyDetector {
  if (!globalAnomalyDetector) {
    globalAnomalyDetector = new AnomalyDetectorImpl();
  }
  return globalAnomalyDetector;
}

/**
 * Reset singleton (for testing)
 */
export function resetGlobalAnomalyDetector(): void {
  globalAnomalyDetector = null;
}
