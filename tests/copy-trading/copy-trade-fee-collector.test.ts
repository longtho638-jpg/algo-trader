import { describe, it, expect } from 'vitest';
import { CopyTradeFeeCollector } from '../../src/copy-trading/copy-trade-fee-collector.js';

describe('CopyTradeFeeCollector', () => {
  it('should collect 10% performance fee split 70/30', () => {
    const collector = new CopyTradeFeeCollector();
    const record = collector.collectFee('ct-1', 'follower-1', 'leader-1', 100);

    expect(record).not.toBeNull();
    expect(record!.totalFee).toBeCloseTo(10, 2);        // 10% of $100
    expect(record!.leaderPayout).toBeCloseTo(7, 2);      // 70% of $10
    expect(record!.platformRevenue).toBeCloseTo(3, 2);   // 30% of $10
  });

  it('should return null for losses', () => {
    const collector = new CopyTradeFeeCollector();
    expect(collector.collectFee('ct-2', 'f1', 'l1', -50)).toBeNull();
  });

  it('should return null for dust profits below threshold', () => {
    const collector = new CopyTradeFeeCollector();
    expect(collector.collectFee('ct-3', 'f1', 'l1', 0.25)).toBeNull();
  });

  it('should use custom fee config', () => {
    const collector = new CopyTradeFeeCollector({
      performanceFeeRate: 0.20,   // 20%
      leaderShareRate: 0.50,      // 50/50 split
      minProfitThreshold: 1.00,
    });

    const record = collector.collectFee('ct-4', 'f1', 'l1', 200);
    expect(record!.totalFee).toBeCloseTo(40, 2);
    expect(record!.leaderPayout).toBeCloseTo(20, 2);
    expect(record!.platformRevenue).toBeCloseTo(20, 2);
  });

  it('should track leader fees', () => {
    const collector = new CopyTradeFeeCollector();
    collector.collectFee('ct-1', 'f1', 'leader-A', 100);
    collector.collectFee('ct-2', 'f2', 'leader-A', 50);
    collector.collectFee('ct-3', 'f1', 'leader-B', 200);

    const leaderAFees = collector.getLeaderFees('leader-A');
    expect(leaderAFees).toHaveLength(2);
    expect(leaderAFees[0].grossProfit).toBe(100);
  });

  it('should track follower fees', () => {
    const collector = new CopyTradeFeeCollector();
    collector.collectFee('ct-1', 'follower-X', 'l1', 100);
    collector.collectFee('ct-2', 'follower-X', 'l2', 50);

    expect(collector.getFollowerFees('follower-X')).toHaveLength(2);
  });

  it('should calculate leader payout summary', () => {
    const collector = new CopyTradeFeeCollector();
    collector.collectFee('ct-1', 'f1', 'leader-A', 100);
    collector.collectFee('ct-2', 'f2', 'leader-A', 200);

    const summary = collector.getPayoutSummary('leader-A');
    expect(summary.leaderId).toBe('leader-A');
    expect(summary.tradeCount).toBe(2);
    expect(summary.totalPayout).toBeCloseTo(21, 1); // 7 + 14
  });

  it('should calculate total platform revenue', () => {
    const collector = new CopyTradeFeeCollector();
    collector.collectFee('ct-1', 'f1', 'l1', 100);  // $3 platform
    collector.collectFee('ct-2', 'f2', 'l2', 200);  // $6 platform
    collector.collectFee('ct-3', 'f1', 'l1', -50);  // no fee

    expect(collector.getTotalPlatformRevenue()).toBeCloseTo(9, 1);
  });

  it('should return all records for admin', () => {
    const collector = new CopyTradeFeeCollector();
    collector.collectFee('ct-1', 'f1', 'l1', 100);
    collector.collectFee('ct-2', 'f2', 'l2', 50);

    expect(collector.getAllRecords()).toHaveLength(2);
  });
});
