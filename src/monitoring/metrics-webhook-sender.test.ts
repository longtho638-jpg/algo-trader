/**
 * MetricsWebhookSender Unit Tests
 */

import { MetricsWebhookSenderClass, resetGlobalMetricsWebhookSender } from './metrics-webhook-sender';

// Mock fetch globally
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

describe('MetricsWebhookSender', () => {
  const mockWebhookUrl = 'https://api.example.com/webhooks/metrics';

  let sender: MetricsWebhookSenderClass;

  beforeEach(() => {
    jest.clearAllMocks();
    resetGlobalMetricsWebhookSender();
    sender = new MetricsWebhookSenderClass();
    sender.setWebhookUrl(mockWebhookUrl);
  });

  describe('constructor', () => {
    it('should create sender', () => {
      expect(sender).toBeDefined();
    });
  });

  describe('sendGeneric', () => {
    const mockPayload = {
      type: 'test' as const,
      tenantId: 'tenant-123',
      tier: 'pro',
      timestamp: Date.now(),
      data: { key: 'value' },
    };

    it('should send webhook successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => 'OK',
      });

      const result = await sender.sendGeneric(mockPayload);

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.attempts).toBe(1);

      // Verify fetch was called with correct arguments
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(mockWebhookUrl);
      expect(options.method).toBe('POST');
      expect(options.headers).toHaveProperty('Content-Type', 'application/json');
    });

    it('should handle failed webhook delivery', async () => {
      mockFetch.mockImplementation(() => {
        throw new Error('Network error');
      });

      const result = await sender.sendGeneric(mockPayload);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should retry on failure', async () => {
      // First two attempts fail, third succeeds
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => 'OK',
        });

      const result = await sender.sendGeneric(mockPayload);

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should return error without webhook URL', async () => {
      const senderNoUrl = new MetricsWebhookSenderClass();
      const result = await senderNoUrl.sendGeneric(mockPayload);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Webhook URL not configured');
      expect(result.attempts).toBe(0);
    });
  });

  describe('sendAnomaly', () => {
    it('should send anomaly alert', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => 'OK',
      });

      const result = await sender.sendAnomaly({
        type: 'anomaly',
        anomalyType: 'latency',
        severity: 'high',
        tenantId: 't1',
        tier: 'pro',
        timestamp: Date.now(),
        data: { actualValue: 2500, threshold: 1000 },
        actualValue: 2500,
        threshold: 1000,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('sendUsage', () => {
    it('should send usage metrics', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => 'OK',
      });

      const result = await sender.sendUsage({
        type: 'usage',
        metric: 'api_calls',
        usage: 9000,
        limit: 10000,
        percentageUsed: 90,
        tenantId: 't1',
        tier: 'pro',
        timestamp: Date.now(),
        data: {},
      });

      expect(result.success).toBe(true);
    });
  });
});
