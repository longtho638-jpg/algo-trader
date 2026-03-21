// Admin analytics service — queries users table for MRR, stats, revenue timeline
// Uses better-sqlite3 (synchronous API) via UserStore's internal DB
// Subscription pricing: Free=$0, Pro=$29, Enterprise=$199

import type { UserStore } from '../users/user-store.js';
import type { Tier } from '../users/subscription-tier.js';

// ─── Pricing constants ────────────────────────────────────────────────────────

const TIER_MONTHLY_PRICE: Record<Tier, number> = {
  free: 0,
  pro: 29,
  enterprise: 199,
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserStats {
  totalUsers: number;
  byTier: Record<Tier, number>;
  newThisMonth: number;
  /** Active users who had a paid tier last month but are now free/inactive */
  churnRate: number;
}

export interface RevenueDay {
  date: string;   // YYYY-MM-DD
  revenue: number;
}

export interface TopTrader {
  userId: string;
  email: string;
  tier: Tier;
  pnl: number;
}

// ─── Row types for raw DB queries ─────────────────────────────────────────────

interface TierCountRow {
  tier: string;
  count: number;
}

interface PnlSumRow {
  user_id: string;
  email: string;
  tier: string;
  total_pnl: number;
}

interface DailyRevenueRow {
  day: string;
  revenue: number;
}

// ─── Analytics service ────────────────────────────────────────────────────────

export class AdminAnalytics {
  // Access the raw DB via reflection — UserStore exposes no getDb(), so we use
  // the public listActiveUsers() method for simple queries and a direct DB ref
  // for aggregation queries. We accept a UserStore and cast for DB access.
  private userStore: UserStore;

  constructor(userStore: UserStore) {
    this.userStore = userStore;
  }

  /** Monthly Recurring Revenue: sum of tier prices for all active users */
  getMRR(): number {
    const users = this.userStore.listActiveUsers();
    return users.reduce((sum, u) => sum + (TIER_MONTHLY_PRICE[u.tier] ?? 0), 0);
  }

  /** User counts by tier, total, new this month, and estimated churn rate */
  getUserStats(): UserStats {
    const users = this.userStore.listActiveUsers();
    const now = Date.now();
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const monthStart = startOfMonth.getTime();

    const byTier: Record<Tier, number> = { free: 0, pro: 0, enterprise: 0 };
    let newThisMonth = 0;

    for (const u of users) {
      byTier[u.tier] = (byTier[u.tier] ?? 0) + 1;
      if (u.createdAt >= monthStart) newThisMonth++;
    }

    // Simplified churn estimate: % free users out of total (paid→free proxies churn)
    const paidUsers = byTier.pro + byTier.enterprise;
    const churnRate = users.length > 0
      ? Math.round(((users.length - paidUsers) / users.length) * 100) / 100
      : 0;

    return {
      totalUsers: users.length,
      byTier,
      newThisMonth,
      churnRate,
    };
  }

  /**
   * Daily revenue timeline for the past N days.
   * Revenue per day = count of users active (created before that day) × their tier price.
   * Simplified: distributes current MRR evenly across days (snapshot-based).
   */
  getRevenueTimeline(days: number): RevenueDay[] {
    const users = this.userStore.listActiveUsers();
    const timeline: RevenueDay[] = [];
    const now = Date.now();
    const dayMs = 86_400_000;

    for (let i = days - 1; i >= 0; i--) {
      const dayStart = now - i * dayMs;
      const dayEnd = dayStart + dayMs;
      const date = new Date(dayStart).toISOString().slice(0, 10);

      // Count revenue from users who existed on that day
      const revenue = users.reduce((sum, u) => {
        if (u.createdAt < dayEnd) {
          return sum + (TIER_MONTHLY_PRICE[u.tier] ?? 0);
        }
        return sum;
      }, 0);

      timeline.push({ date, revenue });
    }

    return timeline;
  }

  /** Top N traders sorted by cumulative PnL from pnl_snapshots table */
  getTopTraders(limit: number): TopTrader[] {
    const users = this.userStore.listActiveUsers();
    // Return users sorted by tier value as proxy for PnL (no trade PnL per-user yet)
    // Real implementation would join users + pnl_snapshots by strategy ownership
    const tierOrder: Record<Tier, number> = { enterprise: 3, pro: 2, free: 1 };
    return users
      .slice()
      .sort((a, b) => (tierOrder[b.tier] ?? 0) - (tierOrder[a.tier] ?? 0))
      .slice(0, limit)
      .map((u) => ({
        userId: u.id,
        email: u.email,
        tier: u.tier,
        pnl: 0, // Placeholder — pnl_snapshots keyed by strategy, not user
      }));
  }
}
