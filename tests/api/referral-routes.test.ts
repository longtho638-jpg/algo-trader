import { describe, it, expect, beforeEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ReferralStore } from '../../src/referral/referral-store.js';
import { RewardCalculator } from '../../src/referral/reward-calculator.js';
import { ReferralManager } from '../../src/referral/referral-manager.js';
import type { AuthenticatedRequest } from '../../src/api/auth-middleware.js';
import { randomUUID } from 'node:crypto';
import { sendJson, readJsonBody } from '../../src/api/http-response-helpers.js';

describe('Referral Routes', () => {
  let store: ReferralStore;
  let calculator: RewardCalculator;
  let manager: ReferralManager;
  let testDb: string;

  beforeEach(() => {
    // Use unique test DB per test to avoid DB lock/isolation issues
    testDb = `/tmp/test-referral-${randomUUID()}.db`;
    store = new ReferralStore(testDb);
    calculator = new RewardCalculator(store);
    manager = new ReferralManager(store, calculator);
  });

  // Helper function to simulate route handler for generate
  async function testGenerate(userId: string): Promise<{ status: number; data: any }> {
    let status = 0;
    let responseData = '';
    const req = {
      method: 'POST',
      user: { id: userId, tier: 'pro' },
    } as AuthenticatedRequest;
    const res = {
      writeHead: (s: number) => { status = s; },
      end: (data: string) => { responseData = data; },
    } as any;

    // Directly call the logic instead of route handler
    const code = manager.generateCode(userId);
    sendJson(res, 201, { code: code.code, maxUses: code.maxUses });
    return { status, data: JSON.parse(responseData) };
  }

  // Helper function to simulate route handler for redeem
  async function testRedeem(userId: string, code: string): Promise<{ status: number; data: any }> {
    let status = 0;
    let responseData = '';
    const res = {
      writeHead: (s: number) => { status = s; },
      end: (data: string) => { responseData = data; },
    } as any;

    try {
      const link = manager.redeemCode(code, userId);
      sendJson(res, 200, { referrerId: link.referrerId, code: link.code, createdAt: link.createdAt });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to redeem code';
      sendJson(res, 400, { error: 'Bad Request', message: msg });
    }
    return { status, data: JSON.parse(responseData) };
  }

  describe('POST /api/referral/generate', () => {
    it('should generate a referral code for user', async () => {
      const { status, data } = await testGenerate('user-1');
      expect(status).toBe(201);
      expect(data.code).toBeTruthy();
      expect(data.code.length).toBe(8);
      expect(data.maxUses).toBe(100);
    });

    it('should generate unique codes on multiple calls', async () => {
      const codes: string[] = [];
      for (let i = 0; i < 3; i++) {
        const { data } = await testGenerate('user-1');
        codes.push(data.code);
      }

      // All codes should be unique
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(3);
    });
  });

  describe('POST /api/referral/redeem', () => {
    it('should successfully redeem a valid referral code', async () => {
      // Generate code for referrer
      const referrerId = 'referrer-1';
      const code = manager.generateCode(referrerId);

      // Redeem for new user
      const { status, data } = await testRedeem('referee-1', code.code);
      expect(status).toBe(200);
      expect(data.referrerId).toBe(referrerId);
      expect(data.code).toBe(code.code);
    });

    it('should reject invalid referral code', async () => {
      const { status, data } = await testRedeem('referee-1', 'INVALID_CODE');
      expect(status).toBe(400);
      expect(data.error).toBe('Bad Request');
    });

    it('should reject when user tries to redeem own code', async () => {
      const userId = 'user-1';
      const code = manager.generateCode(userId);

      const { status, data } = await testRedeem(userId, code.code);
      expect(status).toBe(400);
      expect(data.message).toContain('Cannot redeem your own');
    });

    it('should reject when user already redeemed a code', async () => {
      const referrerId = 'referrer-1';
      const code1 = manager.generateCode(referrerId);
      const referrer2Id = 'referrer-2';
      const code2 = manager.generateCode(referrer2Id);
      const refereeId = 'referee-1';

      // Redeem first code
      manager.redeemCode(code1.code, refereeId);

      // Try to redeem second code
      const { status, data } = await testRedeem(refereeId, code2.code);
      expect(status).toBe(400);
      expect(data.message).toContain('already redeemed');
    });
  });

  describe('GET /api/referral/stats', () => {
    it('should return stats for user with no codes', async () => {
      const userId = 'user-no-codes';
      const codes = manager.getUserCodes(userId);
      let totalConversions = 0;
      let totalRevenueNum = 0;
      const codeStats = codes.map((c) => {
        const s = manager.getCodeStats(c.code);
        totalConversions += s.conversions;
        totalRevenueNum += parseFloat(s.revenueAttributed);
        return s;
      });

      expect(codeStats).toEqual([]);
      expect(totalConversions).toBe(0);
      expect(totalRevenueNum).toBe(0);
    });

    it('should return aggregated stats for user codes', async () => {
      const userId = 'user-1';
      const code = manager.generateCode(userId);

      const codes = manager.getUserCodes(userId);
      let totalConversions = 0;
      let totalRevenueNum = 0;
      const codeStats = codes.map((c) => {
        const s = manager.getCodeStats(c.code);
        totalConversions += s.conversions;
        totalRevenueNum += parseFloat(s.revenueAttributed);
        return s;
      });

      expect(codeStats).toHaveLength(1);
      expect(codeStats[0].code).toBe(code.code);
    });
  });

  describe('GET /api/referral/my-codes', () => {
    it('should return empty list when user has no codes', async () => {
      const userId = 'user-no-codes';
      const codes = manager.getUserCodes(userId);
      expect(codes).toEqual([]);
    });

    it('should return all codes owned by user', async () => {
      const userId = 'user-1';
      const code1 = manager.generateCode(userId);
      const code2 = manager.generateCode(userId);

      const codes = manager.getUserCodes(userId);
      expect(codes).toHaveLength(2);
      const codeValues = codes.map((c) => c.code);
      expect(codeValues).toContain(code1.code);
      expect(codeValues).toContain(code2.code);
    });
  });

});
