/**
 * Metrics Webhook Sender - Send Metrics to Webhooks
 *
 * Sends anomaly and usage events to configured webhooks:
 * - Anomaly alerts (latency spikes, error rate increases)
 * - Usage threshold notifications
 * - Trade summary reports
 *
 * Supports retry logic with exponential backoff
 */

export interface WebhookPayload {
  type: string;
  tenantId?: string;
  tier?: string;
  timestamp: number;
  data: Record<string, unknown>;
}

export interface WebhookDeliveryResult {
  success: boolean;
  statusCode?: number;
  error?: string;
  attempts: number;
}

export interface AnomalyWebhookPayload extends WebhookPayload {
  type: 'anomaly';
  anomalyType: string;
  severity: string;
  actualValue: number;
  threshold: number;
}

export interface UsageWebhookPayload extends WebhookPayload {
  type: 'usage';
  metric: string;
  usage: number;
  limit: number;
  percentageUsed: number;
}

export interface MetricsWebhookSender {
  sendAnomaly(payload: AnomalyWebhookPayload): Promise<WebhookDeliveryResult>;
  sendUsage(payload: UsageWebhookPayload): Promise<WebhookDeliveryResult>;
  sendGeneric(payload: WebhookPayload): Promise<WebhookDeliveryResult>;
  setWebhookUrl(url: string): void;
}

class MetricsWebhookSenderImpl implements MetricsWebhookSender {
  private webhookUrl?: string;
  private readonly MAX_RETRIES = 3;
  private readonly BASE_DELAY_MS = 1000;

  setWebhookUrl(url: string): void {
    this.webhookUrl = url;
  }

  async sendAnomaly(payload: AnomalyWebhookPayload): Promise<WebhookDeliveryResult> {
    return this.sendGeneric({
      ...payload,
      type: 'anomaly',
    });
  }

  async sendUsage(payload: UsageWebhookPayload): Promise<WebhookDeliveryResult> {
    return this.sendGeneric({
      ...payload,
      type: 'usage',
    });
  }

  async sendGeneric(payload: WebhookPayload): Promise<WebhookDeliveryResult> {
    if (!this.webhookUrl) {
      return {
        success: false,
        error: 'Webhook URL not configured',
        attempts: 0,
      };
    }

    let lastError: Error | null = null;
    let attempts = 0;

    for (let i = 0; i < this.MAX_RETRIES; i++) {
      attempts++;

      try {
        const response = await fetch(this.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          return {
            success: true,
            statusCode: response.status,
            attempts,
          };
        }

        lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
      }

      // Exponential backoff before retry
      if (i < this.MAX_RETRIES - 1) {
        const delay = this.BASE_DELAY_MS * Math.pow(2, i);
        await this.sleep(delay);
      }
    }

    return {
      success: false,
      error: lastError?.message,
      attempts,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
let globalMetricsWebhookSender: MetricsWebhookSenderImpl | null = null;

export class MetricsWebhookSenderClass extends MetricsWebhookSenderImpl {}

export function getGlobalMetricsWebhookSender(): MetricsWebhookSender {
  if (!globalMetricsWebhookSender) {
    globalMetricsWebhookSender = new MetricsWebhookSenderImpl();
  }
  return globalMetricsWebhookSender;
}

/**
 * Reset singleton (for testing)
 */
export function resetGlobalMetricsWebhookSender(): void {
  globalMetricsWebhookSender = null;
}
