/**
 * License Payment Sync — Polar.sh Payment-License Synchronization
 *
 * Syncs Polar.sh payment data with license management:
 * - Customer/license mapping
 * - Payment status tracking (success/failed)
 * - Amount and currency tracking
 * - Order/subscription ID storage
 *
 * Integrates with Polar webhook handler for automated updates.
 */

import { LicenseTier } from './raas-gate';
import { logger } from '../utils/logger';

/**
 * Payment status from Polar.sh
 */
export type PaymentStatus =
  | 'pending'
  | 'success'
  | 'failed'
  | 'refunded'
  | 'disputed';

/**
 * Subscription status from Polar.sh
 */
export type SubscriptionStatus =
  | 'active'
  | 'cancelled'
  | 'expired'
  | 'incomplete';

/**
 * Payment record for tracking
 */
export interface PaymentRecord {
  /** Unique payment ID */
  id: string;
  /** Polar.sh order ID */
  orderId: string;
  /** Polar.sh subscription ID (if recurring) */
  subscriptionId?: string;
  /** License key associated with payment */
  licenseKey: string;
  /** Customer email */
  customerEmail: string;
  /** Payment status */
  status: PaymentStatus;
  /** Amount in cents */
  amount: number;
  /** Currency code (USD, EUR, etc.) */
  currency: string;
  /** Payment timestamp */
  createdAt: string;
  /** Last updated timestamp */
  updatedAt: string;
  /** Metadata from Polar.sh */
  metadata?: Record<string, any>;
}

/**
 * Subscription record for tracking
 */
export interface SubscriptionRecord {
  /** Polar.sh subscription ID */
  id: string;
  /** License key associated with subscription */
  licenseKey: string;
  /** Customer email */
  customerEmail: string;
  /** Subscription status */
  status: SubscriptionStatus;
  /** License tier */
  tier: LicenseTier;
  /** Recurring interval (month/year) */
  interval: 'month' | 'year';
  /** Amount in cents */
  amount: number;
  /** Currency code */
  currency: string;
  /** Current period start */
  currentPeriodStart: string;
  /** Current period end */
  currentPeriodEnd: string;
  /** Created timestamp */
  createdAt: string;
  /** Last updated timestamp */
  updatedAt: string;
  /** Cancelled at timestamp (if cancelled) */
  cancelledAt?: string;
}

/**
 * Sync result after processing webhook
 */
export interface SyncResult {
  success: boolean;
  licenseKey: string;
  paymentId?: string;
  subscriptionId?: string;
  tier: LicenseTier;
  message: string;
}

/**
 * License Payment Sync Service
 *
 * Synchronizes Polar.sh payment data with local license records.
 * Maintains mapping between Polar.sh IDs and license keys.
 */
export class LicensePaymentSync {
  private static instance: LicensePaymentSync;

  // In-memory storage (in production, use database)
  private payments = new Map<string, PaymentRecord>();
  private subscriptions = new Map<string, SubscriptionRecord>();
  private licenseToSubscription = new Map<string, string>();

  private constructor() {}

  static getInstance(): LicensePaymentSync {
    if (!LicensePaymentSync.instance) {
      LicensePaymentSync.instance = new LicensePaymentSync();
    }
    return LicensePaymentSync.instance;
  }

  /**
   * Reset instance (for testing)
   */
  static resetInstance(): void {
    const instance = new LicensePaymentSync();
    LicensePaymentSync.instance = instance;
  }

  /**
   * Record payment from webhook
   */
  async recordPayment(
    orderId: string,
    licenseKey: string,
    customerEmail: string,
    amount: number,
    currency: string,
    status: PaymentStatus,
    metadata?: Record<string, any>
  ): Promise<PaymentRecord> {
    const now = new Date().toISOString();
    const paymentId = `pay_${orderId}_${Date.now()}`;

    const record: PaymentRecord = {
      id: paymentId,
      orderId,
      subscriptionId: metadata?.subscription_id,
      licenseKey,
      customerEmail,
      status,
      amount,
      currency,
      createdAt: now,
      updatedAt: now,
      metadata,
    };

    this.payments.set(paymentId, record);

    logger.info('[LicensePaymentSync] Payment recorded', {
      paymentId,
      orderId,
      licenseKey,
      amount,
      status,
    });

    return record;
  }

  /**
   * Update payment status from webhook
   */
  async updatePaymentStatus(
    paymentId: string,
    status: PaymentStatus
  ): Promise<PaymentRecord | null> {
    const record = this.payments.get(paymentId);
    if (!record) {
      logger.warn('[LicensePaymentSync] Payment not found', { paymentId });
      return null;
    }

    record.status = status;
    record.updatedAt = new Date().toISOString();

    logger.info('[LicensePaymentSync] Payment status updated', {
      paymentId,
      status,
    });

    return record;
  }

  /**
   * Record subscription from webhook
   */
  async recordSubscription(
    subscriptionId: string,
    licenseKey: string,
    customerEmail: string,
    tier: LicenseTier,
    amount: number,
    currency: string,
    interval: 'month' | 'year',
    currentPeriodStart: Date,
    currentPeriodEnd: Date
  ): Promise<SubscriptionRecord> {
    const now = new Date().toISOString();

    const record: SubscriptionRecord = {
      id: subscriptionId,
      licenseKey,
      customerEmail,
      status: 'active',
      tier,
      interval,
      amount,
      currency,
      currentPeriodStart: currentPeriodStart.toISOString(),
      currentPeriodEnd: currentPeriodEnd.toISOString(),
      createdAt: now,
      updatedAt: now,
    };

    this.subscriptions.set(subscriptionId, record);
    this.licenseToSubscription.set(licenseKey, subscriptionId);

    logger.info('[LicensePaymentSync] Subscription recorded', {
      subscriptionId,
      licenseKey,
      tier,
      amount,
    });

    return record;
  }

  /**
   * Update subscription status from webhook
   */
  async updateSubscriptionStatus(
    subscriptionId: string,
    status: SubscriptionStatus,
    tier?: LicenseTier
  ): Promise<SubscriptionRecord | null> {
    const record = this.subscriptions.get(subscriptionId);
    if (!record) {
      logger.warn('[LicensePaymentSync] Subscription not found', {
        subscriptionId,
      });
      return null;
    }

    const oldStatus = record.status;
    record.status = status;
    record.updatedAt = new Date().toISOString();

    if (tier) {
      record.tier = tier;
    }

    if (status === 'cancelled') {
      record.cancelledAt = new Date().toISOString();
    }

    logger.info('[LicensePaymentSync] Subscription status updated', {
      subscriptionId,
      oldStatus,
      newStatus: status,
    });

    return record;
  }

  /**
   * Get payment by ID
   */
  getPayment(paymentId: string): PaymentRecord | undefined {
    return this.payments.get(paymentId);
  }

  /**
   * Get subscription by ID
   */
  getSubscription(subscriptionId: string): SubscriptionRecord | undefined {
    return this.subscriptions.get(subscriptionId);
  }

  /**
   * Get subscription by license key
   */
  getSubscriptionByLicense(licenseKey: string): SubscriptionRecord | undefined {
    const subscriptionId = this.licenseToSubscription.get(licenseKey);
    if (!subscriptionId) {
      return undefined;
    }
    return this.subscriptions.get(subscriptionId);
  }

  /**
   * Get all payments for a license
   */
  getPaymentsByLicense(licenseKey: string): PaymentRecord[] {
    return Array.from(this.payments.values()).filter(
      (p) => p.licenseKey === licenseKey
    );
  }

  /**
   * Get all active subscriptions
   */
  getActiveSubscriptions(): SubscriptionRecord[] {
    return Array.from(this.subscriptions.values()).filter(
      (s) => s.status === 'active'
    );
  }

  /**
   * Get total revenue (sum of all successful payments)
   */
  getTotalRevenue(currency: string = 'USD'): number {
    return Array.from(this.payments.values())
      .filter((p) => p.status === 'success' && p.currency === currency)
      .reduce((sum, p) => sum + p.amount, 0);
  }

  /**
   * Get MRR (Monthly Recurring Revenue)
   */
  getMRR(): number {
    const activeSubs = this.getActiveSubscriptions();
    return activeSubs.reduce((sum, s) => {
      const monthlyAmount = s.interval === 'year' ? s.amount / 12 : s.amount;
      return sum + monthlyAmount;
    }, 0);
  }

  /**
   * Get payment statistics
   */
  getPaymentStats(): {
    totalPayments: number;
    successfulPayments: number;
    failedPayments: number;
    totalRevenue: number;
    averagePayment: number;
  } {
    const allPayments = Array.from(this.payments.values());
    const successful = allPayments.filter((p) => p.status === 'success');
    const failed = allPayments.filter(
      (p) => p.status === 'failed' || p.status === 'disputed'
    );

    const totalRevenue = successful.reduce((sum, p) => sum + p.amount, 0);

    return {
      totalPayments: allPayments.length,
      successfulPayments: successful.length,
      failedPayments: failed.length,
      totalRevenue,
      averagePayment: successful.length > 0 ? totalRevenue / successful.length : 0,
    };
  }

  /**
   * Get subscription statistics by tier
   */
  getSubscriptionStats(): {
    totalSubscriptions: number;
    activeSubscriptions: number;
    cancelledSubscriptions: number;
    byTier: Record<LicenseTier, number>;
    byInterval: { month: number; year: number };
  } {
    const allSubs = Array.from(this.subscriptions.values());
    const active = allSubs.filter((s) => s.status === 'active');
    const cancelled = allSubs.filter((s) => s.status === 'cancelled');

    const byTier: Record<LicenseTier, number> = {
      [LicenseTier.FREE]: 0,
      [LicenseTier.PRO]: 0,
      [LicenseTier.ENTERPRISE]: 0,
    };

    const byInterval = { month: 0, year: 0 };

    for (const sub of active) {
      byTier[sub.tier]++;
      byInterval[sub.interval]++;
    }

    return {
      totalSubscriptions: allSubs.length,
      activeSubscriptions: active.length,
      cancelledSubscriptions: cancelled.length,
      byTier,
      byInterval,
    };
  }

  /**
   * Process payment.success webhook event
   */
  async processPaymentSuccess(
    orderId: string,
    subscriptionId: string | undefined,
    customerEmail: string,
    amount: number,
    currency: string,
    metadata?: Record<string, any>
  ): Promise<SyncResult> {
    const licenseKey = metadata?.license_key || `license_${orderId}`;

    await this.recordPayment(
      orderId,
      licenseKey,
      customerEmail,
      amount,
      currency,
      'success',
      metadata
    );

    logger.info('[LicensePaymentSync] Payment success processed', {
      orderId,
      licenseKey,
      amount,
    });

    return {
      success: true,
      licenseKey,
      paymentId: `pay_${orderId}`,
      subscriptionId,
      tier: LicenseTier.PRO,
      message: 'Payment recorded successfully',
    };
  }

  /**
   * Process payment.failed webhook event
   */
  async processPaymentFailed(
    orderId: string,
    customerEmail: string,
    amount: number,
    currency: string,
    metadata?: Record<string, any>
  ): Promise<SyncResult> {
    const licenseKey = metadata?.license_key || `license_${orderId}`;

    await this.recordPayment(
      orderId,
      licenseKey,
      customerEmail,
      amount,
      currency,
      'failed',
      metadata
    );

    logger.warn('[LicensePaymentSync] Payment failed', {
      orderId,
      licenseKey,
      amount,
    });

    return {
      success: false,
      licenseKey,
      paymentId: `pay_${orderId}`,
      tier: LicenseTier.FREE,
      message: 'Payment failed - license downgraded to FREE',
    };
  }

  /**
   * Process subscription.created webhook event
   */
  async processSubscriptionCreated(
    subscriptionId: string,
    customerEmail: string,
    tier: LicenseTier,
    amount: number,
    currency: string,
    interval: 'month' | 'year',
    currentPeriodStart: Date,
    currentPeriodEnd: Date,
    metadata?: Record<string, any>
  ): Promise<SyncResult> {
    const licenseKey = metadata?.license_key || `license_${subscriptionId}`;

    await this.recordSubscription(
      subscriptionId,
      licenseKey,
      customerEmail,
      tier,
      amount,
      currency,
      interval,
      currentPeriodStart,
      currentPeriodEnd
    );

    logger.info('[LicensePaymentSync] Subscription created', {
      subscriptionId,
      licenseKey,
      tier,
      amount,
    });

    return {
      success: true,
      licenseKey,
      subscriptionId,
      tier,
      message: 'Subscription recorded',
    };
  }

  /**
   * Process subscription.cancelled webhook event
   */
  async processSubscriptionCancelled(
    subscriptionId: string
  ): Promise<SyncResult> {
    const record = await this.updateSubscriptionStatus(
      subscriptionId,
      'cancelled'
    );

    if (!record) {
      return {
        success: false,
        licenseKey: subscriptionId,
        tier: LicenseTier.FREE,
        message: 'Subscription not found',
      };
    }

    logger.info('[LicensePaymentSync] Subscription cancelled', {
      subscriptionId,
      licenseKey: record.licenseKey,
    });

    return {
      success: true,
      licenseKey: record.licenseKey,
      subscriptionId,
      tier: LicenseTier.FREE,
      message: 'Subscription cancelled - license downgraded to FREE',
    };
  }

  /**
   * Reset all data (testing only)
   */
  reset(): void {
    this.payments.clear();
    this.subscriptions.clear();
    this.licenseToSubscription.clear();
  }
}

/**
 * Export singleton instance
 */
export const licensePaymentSync = LicensePaymentSync.getInstance();
