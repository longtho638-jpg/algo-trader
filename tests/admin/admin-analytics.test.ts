import { describe, it, expect } from 'vitest';
import { AdminAnalytics } from '../../src/admin/admin-analytics.js';

function makeUserStore(users: Array<{ id: string; email: string; tier: 'free' | 'pro' | 'enterprise'; createdAt: number }>) {
  return {
    listActiveUsers: () => users,
  };
}

describe('AdminAnalytics', () => {
  describe('getMRR', () => {
    it('should return 0 for no users', () => {
      const analytics = new AdminAnalytics(makeUserStore([]) as any);
      expect(analytics.getMRR()).toBe(0);
    });

    it('should calculate MRR from tier prices', () => {
      const users = [
        { id: '1', email: 'a@a.com', tier: 'pro' as const, createdAt: 1000 },
        { id: '2', email: 'b@b.com', tier: 'enterprise' as const, createdAt: 1000 },
        { id: '3', email: 'c@c.com', tier: 'free' as const, createdAt: 1000 },
      ];
      const analytics = new AdminAnalytics(makeUserStore(users) as any);
      // Pro=$29 + Enterprise=$199 + Free=$0 = $228
      expect(analytics.getMRR()).toBe(228);
    });

    it('should sum multiple pro users', () => {
      const users = [
        { id: '1', email: 'a@a.com', tier: 'pro' as const, createdAt: 1000 },
        { id: '2', email: 'b@b.com', tier: 'pro' as const, createdAt: 1000 },
      ];
      const analytics = new AdminAnalytics(makeUserStore(users) as any);
      expect(analytics.getMRR()).toBe(58);
    });
  });

  describe('getUserStats', () => {
    it('should count users by tier', () => {
      const users = [
        { id: '1', email: 'a@a.com', tier: 'free' as const, createdAt: 1000 },
        { id: '2', email: 'b@b.com', tier: 'pro' as const, createdAt: 1000 },
        { id: '3', email: 'c@c.com', tier: 'pro' as const, createdAt: 1000 },
        { id: '4', email: 'd@d.com', tier: 'enterprise' as const, createdAt: 1000 },
      ];
      const analytics = new AdminAnalytics(makeUserStore(users) as any);
      const stats = analytics.getUserStats();
      expect(stats.totalUsers).toBe(4);
      expect(stats.byTier.free).toBe(1);
      expect(stats.byTier.pro).toBe(2);
      expect(stats.byTier.enterprise).toBe(1);
    });

    it('should count new users this month', () => {
      const now = Date.now();
      const users = [
        { id: '1', email: 'a@a.com', tier: 'pro' as const, createdAt: now - 1000 }, // this month
        { id: '2', email: 'b@b.com', tier: 'free' as const, createdAt: 1000 }, // long ago
      ];
      const analytics = new AdminAnalytics(makeUserStore(users) as any);
      const stats = analytics.getUserStats();
      expect(stats.newThisMonth).toBeGreaterThanOrEqual(1);
    });

    it('should compute churn rate', () => {
      const users = [
        { id: '1', email: 'a@a.com', tier: 'free' as const, createdAt: 1000 },
        { id: '2', email: 'b@b.com', tier: 'free' as const, createdAt: 1000 },
        { id: '3', email: 'c@c.com', tier: 'pro' as const, createdAt: 1000 },
        { id: '4', email: 'd@d.com', tier: 'enterprise' as const, createdAt: 1000 },
      ];
      const analytics = new AdminAnalytics(makeUserStore(users) as any);
      const stats = analytics.getUserStats();
      // 2 free / 4 total = 0.5
      expect(stats.churnRate).toBe(0.5);
    });
  });

  describe('getRevenueTimeline', () => {
    it('should return daily revenue for N days', () => {
      const users = [
        { id: '1', email: 'a@a.com', tier: 'pro' as const, createdAt: 1000 },
      ];
      const analytics = new AdminAnalytics(makeUserStore(users) as any);
      const timeline = analytics.getRevenueTimeline(7);
      expect(timeline.length).toBe(7);
      expect(timeline[0].revenue).toBe(29); // Pro price
    });

    it('should return 0 revenue for empty users', () => {
      const analytics = new AdminAnalytics(makeUserStore([]) as any);
      const timeline = analytics.getRevenueTimeline(3);
      expect(timeline.every(d => d.revenue === 0)).toBe(true);
    });
  });

  describe('getTopTraders', () => {
    it('should sort by tier value', () => {
      const users = [
        { id: '1', email: 'a@a.com', tier: 'free' as const, createdAt: 1000 },
        { id: '2', email: 'b@b.com', tier: 'enterprise' as const, createdAt: 1000 },
        { id: '3', email: 'c@c.com', tier: 'pro' as const, createdAt: 1000 },
      ];
      const analytics = new AdminAnalytics(makeUserStore(users) as any);
      const top = analytics.getTopTraders(2);
      expect(top.length).toBe(2);
      expect(top[0].tier).toBe('enterprise');
      expect(top[1].tier).toBe('pro');
    });

    it('should respect limit', () => {
      const users = Array.from({ length: 10 }, (_, i) => ({
        id: `u-${i}`, email: `u${i}@test.com`, tier: 'pro' as const, createdAt: 1000,
      }));
      const analytics = new AdminAnalytics(makeUserStore(users) as any);
      expect(analytics.getTopTraders(3).length).toBe(3);
    });
  });
});
