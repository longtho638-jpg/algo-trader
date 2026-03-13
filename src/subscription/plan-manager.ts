/**
 * Subscription Plan Manager — ROIaaS Phase 5
 *
 * Subscription management for Algo-Trader with tier-based features:
 * - Free: 5 trades/day, 3 signals/day, delayed signals
 * - Pro (499k VND/mo): Unlimited trades, real-time signals, API access
 * - Enterprise (1.99M VND/mo): Early signals, custom strategies, priority execution
 *
 * Integrates with Stripe/Polar for payment processing.
 */

import { LicenseService, LicenseTier } from '../lib/raas-gate';
import { logger } from '../utils/logger';

/**
 * Subscription plan definition
 */
export interface SubscriptionPlan {
  id: string;
  name: string;
  tier: LicenseTier;
  priceVND: number;
  priceUSD: number;
  billingPeriod: 'monthly' | 'yearly';
  features: string[];
  limits: {
    tradesPerDay: number;
    signalsPerDay: number;
    apiCallsPerDay: number;
    lookbackDays: number;
    customStrategies: boolean;
    priorityExecution: boolean;
    earlySignals: boolean;
    apiAccess: boolean;
  };
}

/**
 * Subscription status
 */
export interface SubscriptionStatus {
  userId: string;
  tier: LicenseTier;
  status: 'active' | 'cancelled' | 'expired' | 'trialing';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  trialEnd?: Date;
}

/**
 * Checkout session
 */
export interface CheckoutSession {
  id: string;
  url: string;
  planId: string;
  expiresAt: Date;
}

/**
 * Subscription Plan Manager
 */
export class PlanManager {
  private static instance: PlanManager;
  private licenseService: LicenseService;

  // Plan definitions
  private readonly plans: Record<string, SubscriptionPlan> = {
    free: {
      id: 'free',
      name: 'Free',
      tier: LicenseTier.FREE,
      priceVND: 0,
      priceUSD: 0,
      billingPeriod: 'monthly',
      features: [
        '5 trades per day',
        '3 signals per day',
        'Delayed signals (15min)',
        '7-day lookback',
        'Basic analytics',
      ],
      limits: {
        tradesPerDay: 5,
        signalsPerDay: 3,
        apiCallsPerDay: 100,
        lookbackDays: 7,
        customStrategies: false,
        priorityExecution: false,
        earlySignals: false,
        apiAccess: false,
      },
    },
    pro: {
      id: 'pro',
      name: 'Pro',
      tier: LicenseTier.PRO,
      priceVND: 499000,
      priceUSD: 20,
      billingPeriod: 'monthly',
      features: [
        'Unlimited trades',
        'Unlimited signals',
        'Real-time signals',
        '90-day lookback',
        'Advanced analytics',
        'API access',
        'Email support',
      ],
      limits: {
        tradesPerDay: -1,
        signalsPerDay: -1,
        apiCallsPerDay: 10000,
        lookbackDays: 90,
        customStrategies: false,
        priorityExecution: false,
        earlySignals: false,
        apiAccess: true,
      },
    },
    enterprise: {
      id: 'enterprise',
      name: 'Enterprise',
      tier: LicenseTier.ENTERPRISE,
      priceVND: 1990000,
      priceUSD: 80,
      billingPeriod: 'monthly',
      features: [
        'Everything in Pro',
        '365-day lookback',
        'Custom strategies',
        'Priority execution',
        'Early signal access',
        'Advanced risk metrics',
        'Walk-forward analysis',
        'Monte Carlo simulation',
        'Priority support',
      ],
      limits: {
        tradesPerDay: -1,
        signalsPerDay: -1,
        apiCallsPerDay: 100000,
        lookbackDays: 365,
        customStrategies: true,
        priorityExecution: true,
        earlySignals: true,
        apiAccess: true,
      },
    },
  };

  private constructor() {
    this.licenseService = LicenseService.getInstance();
  }

  static getInstance(): PlanManager {
    if (!PlanManager.instance) {
      PlanManager.instance = new PlanManager();
    }
    return PlanManager.instance;
  }

  /**
   * Get all available plans
   */
  getPlans(): SubscriptionPlan[] {
    return Object.values(this.plans);
  }

  /**
   * Get plan by ID
   */
  getPlan(planId: string): SubscriptionPlan | undefined {
    return this.plans[planId];
  }

  /**
   * Get plan by tier
   */
  getPlanByTier(tier: LicenseTier): SubscriptionPlan | undefined {
    return Object.values(this.plans).find(p => p.tier === tier);
  }

  /**
   * Create checkout session
   * In production, integrate with Stripe/Polar
   */
  async createCheckout(
    userId: string,
    planId: string,
    _successUrl?: string,
    _cancelUrl?: string
  ): Promise<CheckoutSession> {
    const plan = this.getPlan(planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    logger.info('[PlanManager] Creating checkout', {
      userId: userId.substring(0, 8) + '...',
      planId,
      planName: plan.name,
      price: plan.priceVND.toLocaleString('vi-VN'),
    });

    // In production, create Stripe/Polar checkout session here
    // For now, return mock session
    return {
      id: `checkout_${Date.now()}`,
      url: `/checkout/mock/${planId}`,
      planId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };
  }

  /**
   * Get subscription status for user
   */
  getSubscriptionStatus(userId: string): SubscriptionStatus {
    const tier = this.licenseService.getTier();

    return {
      userId,
      tier,
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: false,
    };
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(userId: string): Promise<void> {
    logger.info('[PlanManager] Cancelling subscription', {
      userId: userId.substring(0, 8) + '...',
    });

    // In production, cancel via Stripe/Polar
    // For now, just log
  }

  /**
   * Get upgrade recommendations based on usage
   */
  getUpgradeRecommendation(
    userId: string,
    currentTier: LicenseTier,
    usageStats: {
      tradesUsed: number;
      signalsUsed: number;
      apiCallsUsed: number;
    }
  ): { recommendedPlan?: SubscriptionPlan; reason: string } {
    if (currentTier === LicenseTier.FREE) {
      if (
        usageStats.tradesUsed >= 5 ||
        usageStats.signalsUsed >= 3 ||
        usageStats.apiCallsUsed >= 100
      ) {
        return {
          recommendedPlan: this.plans.pro,
          reason: 'You have reached your Free tier limits. Upgrade to Pro for unlimited access.',
        };
      }
    }

    if (currentTier === LicenseTier.PRO) {
      // Check if user would benefit from Enterprise features
      if (usageStats.apiCallsUsed >= 8000) {
        return {
          recommendedPlan: this.plans.enterprise,
          reason: 'You are approaching your Pro API limit. Enterprise offers 10x higher limits.',
        };
      }
    }

    return { reason: 'Your current plan meets your usage needs.' };
  }

  /**
   * Get feature comparison table
   */
  getFeatureComparison(): Array<{
    feature: string;
    free: string | boolean;
    pro: string | boolean;
    enterprise: string | boolean;
  }> {
    return [
      {
        feature: 'Price',
        free: 'Free',
        pro: '499k VND/mo',
        enterprise: '1.99M VND/mo',
      },
      {
        feature: 'Trades per day',
        free: '5',
        pro: 'Unlimited',
        enterprise: 'Unlimited',
      },
      {
        feature: 'Signals per day',
        free: '3',
        pro: 'Unlimited',
        enterprise: 'Unlimited',
      },
      {
        feature: 'API calls per day',
        free: '100',
        pro: '10,000',
        enterprise: '100,000',
      },
      {
        feature: 'Lookback days',
        free: '7',
        pro: '90',
        enterprise: '365',
      },
      {
        feature: 'Custom strategies',
        free: false,
        pro: false,
        enterprise: true,
      },
      {
        feature: 'Priority execution',
        free: false,
        pro: false,
        enterprise: true,
      },
      {
        feature: 'Early signals',
        free: false,
        pro: false,
        enterprise: true,
      },
      {
        feature: 'API access',
        free: false,
        pro: true,
        enterprise: true,
      },
      {
        feature: 'Advanced analytics',
        free: false,
        pro: true,
        enterprise: true,
      },
    ];
  }
}

// Export singleton instance
export const planManager = PlanManager.getInstance();
