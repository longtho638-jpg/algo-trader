/**
 * Billing Events Tracker - Track Billing & Subscription Events
 *
 * Tracks billing-related events:
 * - Subscription changes (activate, cancel, upgrade, downgrade)
 * - Payment events (success, failed, past due)
 * - Overage charges
 * - Stripe sync status
 *
 * Integrates with Polar/Stripe webhook handlers
 */

export type BillingEventType =
  | 'subscription_created'
  | 'subscription_cancelled'
  | 'subscription_updated'
  | 'payment_success'
  | 'payment_failed'
  | 'payment_past_due'
  | 'overage_charged'
  | 'invoice_created'
  | 'refund_processed';

export interface BillingEvent {
  tenantId: string;
  type: BillingEventType;
  timestamp: number;
  amount?: number;
  currency?: string;
  subscriptionId?: string;
  invoiceId?: string;
  metadata?: Record<string, unknown>;
}

export interface TenantBillingStatus {
  tenantId: string;
  subscriptionStatus: 'active' | 'cancelled' | 'past_due' | 'trialing' | 'none';
  currentTier?: string;
  subscriptionStart?: number;
  subscriptionEnd?: number;
  totalSpent: number;
  overageCharges: number;
  lastPaymentDate?: number;
  lastPaymentStatus?: 'success' | 'failed';
}

export interface BillingSummary {
  totalTenants: number;
  activeSubscriptions: number;
  pastDueCount: number;
  totalOverage: number;
  stripeSyncHealth: {
    successful: number;
    failed: number;
    successRate: number;
  };
}

export interface BillingTracker {
  getBillingSummary(): BillingSummary;
  getAllTenantStatuses(): TenantBillingStatus[];
  getRecentEvents(limit?: number): BillingEvent[];
  getTenantStatus(tenantId: string): TenantBillingStatus | undefined;
  recordEvent(event: Omit<BillingEvent, 'timestamp'>): void;
  updateTenantStatus(tenantId: string, status: Partial<TenantBillingStatus>): void;
  recordStripeSync(success: boolean): void;
}

export class BillingEventsTrackerImpl implements BillingTracker {
  private tenantStatuses: Map<string, TenantBillingStatus> = new Map();
  private billingEvents: BillingEvent[] = [];
  private stripeSyncSuccesses = 0;
  private stripeSyncFailures = 0;
  private readonly MAX_EVENTS = 500;

  /**
   * Record a billing event
   */
  recordEvent(event: Omit<BillingEvent, 'timestamp'>): void {
    const fullEvent: BillingEvent = {
      ...event,
      timestamp: Date.now(),
    };

    this.billingEvents.push(fullEvent);

    // Update tenant status based on event type
    this.updateStatusFromEvent(fullEvent);

    // Trim old events
    if (this.billingEvents.length > this.MAX_EVENTS) {
      this.billingEvents = this.billingEvents.slice(-this.MAX_EVENTS);
    }
  }

  /**
   * Update tenant billing status
   */
  updateTenantStatus(tenantId: string, updates: Partial<TenantBillingStatus>): void {
    const existing = this.tenantStatuses.get(tenantId);

    if (existing) {
      this.tenantStatuses.set(tenantId, { ...existing, ...updates });
    } else {
      this.tenantStatuses.set(tenantId, {
        tenantId,
        subscriptionStatus: 'none',
        totalSpent: 0,
        overageCharges: 0,
        ...updates,
      });
    }
  }

  /**
   * Record Stripe sync result
   */
  recordStripeSync(success: boolean): void {
    if (success) {
      this.stripeSyncSuccesses += 1;
    } else {
      this.stripeSyncFailures += 1;
    }
  }

  /**
   * Get billing summary
   */
  getBillingSummary(): BillingSummary {
    const statuses = Array.from(this.tenantStatuses.values());
    const active = statuses.filter(s => s.subscriptionStatus === 'active');
    const pastDue = statuses.filter(s => s.subscriptionStatus === 'past_due');
    const totalOverage = statuses.reduce((sum, s) => sum + s.overageCharges, 0);

    const totalSyncs = this.stripeSyncSuccesses + this.stripeSyncFailures;

    return {
      totalTenants: statuses.length,
      activeSubscriptions: active.length,
      pastDueCount: pastDue.length,
      totalOverage,
      stripeSyncHealth: {
        successful: this.stripeSyncSuccesses,
        failed: this.stripeSyncFailures,
        successRate: totalSyncs > 0 ? this.stripeSyncSuccesses / totalSyncs : 0,
      },
    };
  }

  /**
   * Get all tenant statuses
   */
  getAllTenantStatuses(): TenantBillingStatus[] {
    return Array.from(this.tenantStatuses.values());
  }

  /**
   * Get recent billing events
   */
  getRecentEvents(limit: number = 50): BillingEvent[] {
    return this.billingEvents.slice(-limit);
  }

  /**
   * Get specific tenant status
   */
  getTenantStatus(tenantId: string): TenantBillingStatus | undefined {
    return this.tenantStatuses.get(tenantId);
  }

  /**
   * Internal: Update tenant status from event
   */
  private updateStatusFromEvent(event: BillingEvent): void {
    const existing = this.tenantStatuses.get(event.tenantId);
    let status: Partial<TenantBillingStatus> = {};

    switch (event.type) {
      case 'subscription_created':
        status = {
          subscriptionStatus: 'active',
          subscriptionStart: event.timestamp,
        };
        break;
      case 'subscription_cancelled':
        status = {
          subscriptionStatus: 'cancelled',
          subscriptionEnd: event.timestamp,
        };
        break;
      case 'payment_success':
        status = {
          lastPaymentDate: event.timestamp,
          lastPaymentStatus: 'success',
          totalSpent: (existing?.totalSpent || 0) + (event.amount || 0),
        };
        break;
      case 'payment_failed':
        status = {
          lastPaymentDate: event.timestamp,
          lastPaymentStatus: 'failed',
        };
        break;
      case 'payment_past_due':
        status = { subscriptionStatus: 'past_due' };
        break;
      case 'overage_charged':
        status = {
          overageCharges: (existing?.overageCharges || 0) + (event.amount || 0),
        };
        break;
    }

    if (Object.keys(status).length > 0) {
      this.updateTenantStatus(event.tenantId, status);
    }
  }
}

// Singleton instance
let globalBillingTracker: BillingEventsTrackerImpl | null = null;

export function getGlobalBillingEventsTracker(): BillingTracker {
  if (!globalBillingTracker) {
    globalBillingTracker = new BillingEventsTrackerImpl();
  }
  return globalBillingTracker;
}

/**
 * Reset singleton (for testing)
 */
export function resetGlobalBillingEventsTracker(): void {
  globalBillingTracker = null;
}
