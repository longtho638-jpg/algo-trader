/**
 * License Payment Sync Tests
 */

import { LicensePaymentSync, licensePaymentSync } from './license-payment-sync';
import { LicenseTier } from './raas-gate';

describe('LicensePaymentSync', () => {
  let sync: LicensePaymentSync;

  beforeEach(() => {
    LicensePaymentSync.resetInstance();
    sync = LicensePaymentSync.getInstance();
  });

  describe('Payment Recording', () => {
    test('should record payment successfully', async () => {
      const payment = await sync.recordPayment(
        'order_123',
        'license_abc',
        'user@example.com',
        4900,
        'USD',
        'success'
      );

      expect(payment.id).toBeDefined();
      expect(payment.orderId).toBe('order_123');
      expect(payment.licenseKey).toBe('license_abc');
      expect(payment.amount).toBe(4900);
      expect(payment.status).toBe('success');
    });

    test('should update payment status', async () => {
      const payment = await sync.recordPayment(
        'order_456',
        'license_def',
        'user@example.com',
        4900,
        'USD',
        'pending'
      );

      const updated = await sync.updatePaymentStatus(payment.id, 'success');
      expect(updated?.status).toBe('success');
    });

    test('should return null for non-existent payment', async () => {
      const updated = await sync.updatePaymentStatus('nonexistent', 'success');
      expect(updated).toBeNull();
    });
  });

  describe('Subscription Recording', () => {
    test('should record subscription successfully', async () => {
      const subscription = await sync.recordSubscription(
        'sub_123',
        'license_abc',
        'user@example.com',
        LicenseTier.PRO,
        4900,
        'USD',
        'month',
        new Date('2026-03-01'),
        new Date('2026-04-01')
      );

      expect(subscription.id).toBe('sub_123');
      expect(subscription.licenseKey).toBe('license_abc');
      expect(subscription.tier).toBe(LicenseTier.PRO);
      expect(subscription.status).toBe('active');
    });

    test('should update subscription status', async () => {
      await sync.recordSubscription(
        'sub_456',
        'license_def',
        'user@example.com',
        LicenseTier.PRO,
        4900,
        'USD',
        'month',
        new Date('2026-03-01'),
        new Date('2026-04-01')
      );

      const updated = await sync.updateSubscriptionStatus('sub_456', 'cancelled');
      expect(updated?.status).toBe('cancelled');
      expect(updated?.cancelledAt).toBeDefined();
    });

    test('should update subscription tier', async () => {
      await sync.recordSubscription(
        'sub_789',
        'license_ghi',
        'user@example.com',
        LicenseTier.PRO,
        4900,
        'USD',
        'month',
        new Date('2026-03-01'),
        new Date('2026-04-01')
      );

      const updated = await sync.updateSubscriptionStatus('sub_789', 'active', LicenseTier.ENTERPRISE);
      expect(updated?.tier).toBe(LicenseTier.ENTERPRISE);
    });
  });

  describe('Query Methods', () => {
    test('should get payment by ID', async () => {
      const payment = await sync.recordPayment(
        'order_123',
        'license_abc',
        'user@example.com',
        4900,
        'USD',
        'success'
      );

      const retrieved = sync.getPayment(payment.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.orderId).toBe('order_123');
    });

    test('should get subscription by ID', async () => {
      await sync.recordSubscription(
        'sub_123',
        'license_abc',
        'user@example.com',
        LicenseTier.PRO,
        4900,
        'USD',
        'month',
        new Date('2026-03-01'),
        new Date('2026-04-01')
      );

      const retrieved = sync.getSubscription('sub_123');
      expect(retrieved).toBeDefined();
      expect(retrieved?.licenseKey).toBe('license_abc');
    });

    test('should get subscription by license key', async () => {
      await sync.recordSubscription(
        'sub_123',
        'license_abc',
        'user@example.com',
        LicenseTier.PRO,
        4900,
        'USD',
        'month',
        new Date('2026-03-01'),
        new Date('2026-04-01')
      );

      const retrieved = sync.getSubscriptionByLicense('license_abc');
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('sub_123');
    });

    test('should get payments by license', async () => {
      await sync.recordPayment('order_1', 'license_abc', 'user@example.com', 4900, 'USD', 'success');
      await sync.recordPayment('order_2', 'license_abc', 'user@example.com', 4900, 'USD', 'success');
      await sync.recordPayment('order_3', 'license_def', 'user@example.com', 4900, 'USD', 'success');

      const payments = sync.getPaymentsByLicense('license_abc');
      expect(payments).toHaveLength(2);
    });

    test('should get active subscriptions', async () => {
      await sync.recordSubscription('sub_1', 'license_1', 'user1@example.com', LicenseTier.PRO, 4900, 'USD', 'month', new Date(), new Date());
      await sync.recordSubscription('sub_2', 'license_2', 'user2@example.com', LicenseTier.ENTERPRISE, 19900, 'USD', 'month', new Date(), new Date());
      await sync.recordSubscription('sub_3', 'license_3', 'user3@example.com', LicenseTier.PRO, 4900, 'USD', 'month', new Date(), new Date());
      await sync.updateSubscriptionStatus('sub_3', 'cancelled');

      const active = sync.getActiveSubscriptions();
      expect(active).toHaveLength(2);
    });
  });

  describe('Revenue Metrics', () => {
    test('should calculate total revenue', async () => {
      await sync.recordPayment('order_1', 'license_1', 'user1@example.com', 4900, 'USD', 'success');
      await sync.recordPayment('order_2', 'license_2', 'user2@example.com', 19900, 'USD', 'success');
      await sync.recordPayment('order_3', 'license_3', 'user3@example.com', 4900, 'USD', 'failed');

      const revenue = sync.getTotalRevenue('USD');
      expect(revenue).toBe(4900 + 19900);
    });

    test('should calculate MRR', async () => {
      await sync.recordSubscription('sub_1', 'license_1', 'user1@example.com', LicenseTier.PRO, 4900, 'USD', 'month', new Date(), new Date());
      await sync.recordSubscription('sub_2', 'license_2', 'user2@example.com', LicenseTier.ENTERPRISE, 19900, 'USD', 'month', new Date(), new Date());
      await sync.recordSubscription('sub_3', 'license_3', 'user3@example.com', LicenseTier.PRO, 49000, 'USD', 'year', new Date(), new Date());

      const mrr = sync.getMRR();
      // sub_1: 4900/month, sub_2: 19900/month, sub_3: 49000/12 = 4083.33/month
      expect(mrr).toBeCloseTo(4900 + 19900 + 4083.33, 0);
    });

    test('should get payment stats', async () => {
      await sync.recordPayment('order_1', 'license_1', 'user1@example.com', 4900, 'USD', 'success');
      await sync.recordPayment('order_2', 'license_2', 'user2@example.com', 19900, 'USD', 'success');
      await sync.recordPayment('order_3', 'license_3', 'user3@example.com', 4900, 'USD', 'failed');

      const stats = sync.getPaymentStats();
      expect(stats.totalPayments).toBe(3);
      expect(stats.successfulPayments).toBe(2);
      expect(stats.failedPayments).toBe(1);
      expect(stats.totalRevenue).toBe(4900 + 19900);
      expect(stats.averagePayment).toBeCloseTo((4900 + 19900) / 2, 0);
    });

    test('should get subscription stats', async () => {
      await sync.recordSubscription('sub_1', 'license_1', 'user1@example.com', LicenseTier.PRO, 4900, 'USD', 'month', new Date(), new Date());
      await sync.recordSubscription('sub_2', 'license_2', 'user2@example.com', LicenseTier.ENTERPRISE, 19900, 'USD', 'year', new Date(), new Date());
      await sync.recordSubscription('sub_3', 'license_3', 'user3@example.com', LicenseTier.PRO, 4900, 'USD', 'month', new Date(), new Date());
      await sync.updateSubscriptionStatus('sub_3', 'cancelled');

      const stats = sync.getSubscriptionStats();
      expect(stats.totalSubscriptions).toBe(3);
      expect(stats.activeSubscriptions).toBe(2);
      expect(stats.cancelledSubscriptions).toBe(1);
      expect(stats.byTier[LicenseTier.PRO]).toBe(1); // Only active PRO subscriptions
      expect(stats.byTier[LicenseTier.ENTERPRISE]).toBe(1);
      expect(stats.byInterval.month).toBe(1);
      expect(stats.byInterval.year).toBe(1);
    });
  });

  describe('Webhook Event Processing', () => {
    test('should process payment.success event', async () => {
      const result = await sync.processPaymentSuccess(
        'order_123',
        'sub_123',
        'user@example.com',
        4900,
        'USD',
        { license_key: 'license_abc' }
      );

      expect(result.success).toBe(true);
      expect(result.licenseKey).toBe('license_abc');
      expect(result.subscriptionId).toBe('sub_123');
    });

    test('should process payment.failed event', async () => {
      const result = await sync.processPaymentFailed(
        'order_456',
        'user@example.com',
        4900,
        'USD',
        { license_key: 'license_def' }
      );

      expect(result.success).toBe(false);
      expect(result.licenseKey).toBe('license_def');
      expect(result.tier).toBe(LicenseTier.FREE);
    });

    test('should process subscription.created event', async () => {
      const result = await sync.processSubscriptionCreated(
        'sub_123',
        'user@example.com',
        LicenseTier.PRO,
        4900,
        'USD',
        'month',
        new Date('2026-03-01'),
        new Date('2026-04-01'),
        { license_key: 'license_abc' }
      );

      expect(result.success).toBe(true);
      expect(result.tier).toBe(LicenseTier.PRO);
    });

    test('should process subscription.cancelled event', async () => {
      await sync.recordSubscription(
        'sub_123',
        'license_abc',
        'user@example.com',
        LicenseTier.PRO,
        4900,
        'USD',
        'month',
        new Date('2026-03-01'),
        new Date('2026-04-01')
      );

      const result = await sync.processSubscriptionCancelled('sub_123');

      expect(result.success).toBe(true);
      expect(result.tier).toBe(LicenseTier.FREE);
    });

    test('should return failure for non-existent subscription cancellation', async () => {
      const result = await sync.processSubscriptionCancelled('nonexistent');

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });
  });

  describe('Reset', () => {
    test('should reset all data', async () => {
      await sync.recordPayment('order_1', 'license_1', 'user1@example.com', 4900, 'USD', 'success');
      await sync.recordSubscription('sub_1', 'license_1', 'user1@example.com', LicenseTier.PRO, 4900, 'USD', 'month', new Date(), new Date());

      sync.reset();

      expect(sync.getPayment('pay_order_1')).toBeUndefined();
      expect(sync.getSubscription('sub_1')).toBeUndefined();
    });
  });
});
