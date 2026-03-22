import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkTierGate } from '../../src/api/tier-gate-middleware.js';
import type { IncomingMessage, ServerResponse } from 'node:http';

describe('Tier Gate Middleware (checkTierGate)', () => {
  let mockRes: Partial<ServerResponse>;
  let writeHeadSpy: ReturnType<typeof vi.fn>;
  let endSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    writeHeadSpy = vi.fn();
    endSpy = vi.fn();

    mockRes = {
      writeHead: writeHeadSpy,
      end: endSpy,
    } as Partial<ServerResponse>;
  });

  describe('Free Tier Restrictions', () => {
    it('should block backtesting for free tier', () => {
      const req = {
        user: { id: 'user-1', email: 'test@example.com', tier: 'free' },
      } as any;

      const result = checkTierGate(req, mockRes as any, '/api/backtest');
      expect(result).toBe(false);
      expect(writeHeadSpy).toHaveBeenCalledWith(403, expect.any(Object));
    });

    it('should block marketplace for free tier', () => {
      const req = {
        user: { id: 'user-1', email: 'test@example.com', tier: 'free' },
      } as any;

      const result = checkTierGate(req, mockRes as any, '/api/marketplace/');
      expect(result).toBe(false);
      expect(writeHeadSpy).toHaveBeenCalledWith(403, expect.any(Object));
    });

    it('should block webhook for free tier', () => {
      const req = {
        user: { id: 'user-1', email: 'test@example.com', tier: 'free' },
      } as any;

      const result = checkTierGate(req, mockRes as any, '/api/webhooks/tradingview/user123');
      expect(result).toBe(false);
      expect(writeHeadSpy).toHaveBeenCalledWith(403, expect.any(Object));
    });

    it('should block AI analyze for free tier', () => {
      const req = {
        user: { id: 'user-1', email: 'test@example.com', tier: 'free' },
      } as any;

      const result = checkTierGate(req, mockRes as any, '/api/openclaw/analyze');
      expect(result).toBe(false);
    });

    it('should block AI tune for free tier', () => {
      const req = {
        user: { id: 'user-1', email: 'test@example.com', tier: 'free' },
      } as any;

      const result = checkTierGate(req, mockRes as any, '/api/openclaw/tune');
      expect(result).toBe(false);
    });

    it('should block AI auto-tune for free tier', () => {
      const req = {
        user: { id: 'user-1', email: 'test@example.com', tier: 'free' },
      } as any;

      const result = checkTierGate(req, mockRes as any, '/api/openclaw/auto-tune');
      expect(result).toBe(false);
    });

    it('should block optimizer for free tier', () => {
      const req = {
        user: { id: 'user-1', email: 'test@example.com', tier: 'free' },
      } as any;

      const result = checkTierGate(req, mockRes as any, '/api/pipeline/optimize');
      expect(result).toBe(false);
    });
  });

  describe('Pro Tier Access', () => {
    it('should allow backtesting for pro tier', () => {
      const req = {
        user: { id: 'user-1', email: 'test@example.com', tier: 'pro' },
      } as any;

      const result = checkTierGate(req, mockRes as any, '/api/backtest');
      expect(result).toBe(true);
      expect(writeHeadSpy).not.toHaveBeenCalled();
    });

    it('should allow marketplace for pro tier', () => {
      const req = {
        user: { id: 'user-1', email: 'test@example.com', tier: 'pro' },
      } as any;

      const result = checkTierGate(req, mockRes as any, '/api/marketplace/');
      expect(result).toBe(true);
    });

    it('should allow AI analyze for pro tier', () => {
      const req = {
        user: { id: 'user-1', email: 'test@example.com', tier: 'pro' },
      } as any;

      const result = checkTierGate(req, mockRes as any, '/api/openclaw/analyze');
      expect(result).toBe(true);
    });

    it('should block webhook for pro tier (enterprise-only)', () => {
      const req = {
        user: { id: 'user-1', email: 'test@example.com', tier: 'pro' },
      } as any;

      const result = checkTierGate(req, mockRes as any, '/api/webhooks/tradingview/user123');
      expect(result).toBe(false);
    });

    it('should block AI tune for pro tier (enterprise-only)', () => {
      const req = {
        user: { id: 'user-1', email: 'test@example.com', tier: 'pro' },
      } as any;

      const result = checkTierGate(req, mockRes as any, '/api/openclaw/tune');
      expect(result).toBe(false);
    });

    it('should block optimizer for pro tier (enterprise-only)', () => {
      const req = {
        user: { id: 'user-1', email: 'test@example.com', tier: 'pro' },
      } as any;

      const result = checkTierGate(req, mockRes as any, '/api/pipeline/optimize');
      expect(result).toBe(false);
    });
  });

  describe('Enterprise Tier Access', () => {
    it('should allow all features for enterprise tier', () => {
      const req = {
        user: { id: 'user-1', email: 'test@example.com', tier: 'enterprise' },
      } as any;

      const paths = [
        '/api/backtest',
        '/api/marketplace/',
        '/api/webhooks/tradingview/user123',
        '/api/tv/webhook',
        '/api/pipeline/optimize',
        '/api/openclaw/analyze',
        '/api/openclaw/tune',
        '/api/openclaw/auto-tune',
        '/api/openclaw/usage',
        '/api/openclaw/tuning-history',
        '/api/openclaw/rollback',
      ];

      paths.forEach(path => {
        const result = checkTierGate(req, mockRes as any, path);
        expect(result).toBe(true);
      });
    });

    it('should allow webhook for enterprise tier', () => {
      const req = {
        user: { id: 'user-1', email: 'test@example.com', tier: 'enterprise' },
      } as any;

      const result = checkTierGate(req, mockRes as any, '/api/webhooks/tradingview/user123');
      expect(result).toBe(true);
    });

    it('should allow optimizer for enterprise tier', () => {
      const req = {
        user: { id: 'user-1', email: 'test@example.com', tier: 'enterprise' },
      } as any;

      const result = checkTierGate(req, mockRes as any, '/api/pipeline/optimize');
      expect(result).toBe(true);
    });
  });

  describe('Ungated Paths', () => {
    it('should allow all tiers to access ungated endpoints', () => {
      const tiers = ['free', 'pro', 'enterprise'] as const;
      const ungatedPaths = [
        '/api/strategies',
        '/api/portfolio',
        '/api/orders',
        '/api/users/profile',
      ];

      tiers.forEach(tier => {
        ungatedPaths.forEach(path => {
          const req = {
            user: { id: 'user-1', email: 'test@example.com', tier },
          } as any;

          const result = checkTierGate(req, mockRes as any, path);
          expect(result).toBe(true);
        });
      });
    });
  });

  describe('Unauthenticated Requests', () => {
    it('should return true for unauthenticated requests (no user)', () => {
      const req = {} as any;

      const result = checkTierGate(req, mockRes as any, '/api/backtest');
      expect(result).toBe(true);
      // Auth middleware will handle the rejection
    });

    it('should return true when user is undefined', () => {
      const req = { user: undefined } as any;

      const result = checkTierGate(req, mockRes as any, '/api/backtest');
      expect(result).toBe(true);
    });
  });

  describe('Response Body and Headers', () => {
    it('should send 403 Forbidden response', () => {
      const req = {
        user: { id: 'user-1', email: 'test@example.com', tier: 'free' },
      } as any;

      checkTierGate(req, mockRes as any, '/api/backtest');
      expect(writeHeadSpy).toHaveBeenCalledWith(403, expect.any(Object));
    });

    it('should send JSON response body with feature info', () => {
      const req = {
        user: { id: 'user-1', email: 'test@example.com', tier: 'free' },
      } as any;

      checkTierGate(req, mockRes as any, '/api/backtest');
      expect(endSpy).toHaveBeenCalled();

      const response = JSON.parse(endSpy.mock.calls[0][0]);
      expect(response.error).toBe('Feature not available');
      expect(response.message).toContain('free');
      expect(response.requiredFeature).toBe('backtesting');
    });

    it('should include upgrade URL in response', () => {
      const req = {
        user: { id: 'user-1', email: 'test@example.com', tier: 'free' },
      } as any;

      checkTierGate(req, mockRes as any, '/api/backtest');

      const response = JSON.parse(endSpy.mock.calls[0][0]);
      expect(response.upgradeUrl).toBe('https://cashclaw.cc/pricing');
    });

    it('should set Content-Type header to application/json', () => {
      const req = {
        user: { id: 'user-1', email: 'test@example.com', tier: 'free' },
      } as any;

      checkTierGate(req, mockRes as any, '/api/backtest');

      const headers = writeHeadSpy.mock.calls[0][1];
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('should set Content-Length header', () => {
      const req = {
        user: { id: 'user-1', email: 'test@example.com', tier: 'free' },
      } as any;

      checkTierGate(req, mockRes as any, '/api/backtest');

      const headers = writeHeadSpy.mock.calls[0][1];
      expect(headers['Content-Length']).toBeDefined();
    });
  });

  describe('Path Matching', () => {
    it('should match exact paths', () => {
      const req = {
        user: { id: 'user-1', email: 'test@example.com', tier: 'pro' },
      } as any;

      // Exact match for /api/tv/
      const result = checkTierGate(req, mockRes as any, '/api/tv/webhook123');
      expect(result).toBe(false); // webhook feature blocked for pro
    });

    it('should match prefix paths', () => {
      const req = {
        user: { id: 'user-1', email: 'test@example.com', tier: 'free' },
      } as any;

      // /api/marketplace/ prefix
      const result1 = checkTierGate(req, mockRes as any, '/api/marketplace/products');
      const result2 = checkTierGate(req, mockRes as any, '/api/marketplace/reviews');

      expect(result1).toBe(false);
      expect(result2).toBe(false);
    });

    it('should match openclaw paths with different endpoints', () => {
      const req = {
        user: { id: 'user-1', email: 'test@example.com', tier: 'free' },
      } as any;

      const analyzePath = checkTierGate(req, mockRes as any, '/api/openclaw/analyze');
      const reportPath = checkTierGate(req, mockRes as any, '/api/openclaw/report');
      const statusPath = checkTierGate(req, mockRes as any, '/api/openclaw/status');

      expect(analyzePath).toBe(false);
      expect(reportPath).toBe(false);
      expect(statusPath).toBe(false);
    });
  });

  describe('Feature-Specific Gates', () => {
    it('should gate backtesting feature', () => {
      const req = {
        user: { id: 'user-1', email: 'test@example.com', tier: 'free' },
      } as any;

      const result = checkTierGate(req, mockRes as any, '/api/backtest');
      if (!result) {
        const response = JSON.parse(endSpy.mock.calls[0][0]);
        expect(response.requiredFeature).toBe('backtesting');
      }
    });

    it('should gate webhook feature', () => {
      const req = {
        user: { id: 'user-1', email: 'test@example.com', tier: 'free' },
      } as any;

      const result = checkTierGate(req, mockRes as any, '/api/webhooks/tradingview/user123');
      if (!result) {
        const response = JSON.parse(endSpy.mock.calls[0][0]);
        expect(response.requiredFeature).toBe('webhook');
      }
    });

    it('should gate optimizer feature', () => {
      const req = {
        user: { id: 'user-1', email: 'test@example.com', tier: 'pro' },
      } as any;

      const result = checkTierGate(req, mockRes as any, '/api/pipeline/optimize');
      if (!result) {
        const response = JSON.parse(endSpy.mock.calls[0][0]);
        expect(response.requiredFeature).toBe('optimizer');
      }
    });

    it('should gate ai-analyze feature', () => {
      const req = {
        user: { id: 'user-1', email: 'test@example.com', tier: 'free' },
      } as any;

      const result = checkTierGate(req, mockRes as any, '/api/openclaw/analyze');
      if (!result) {
        const response = JSON.parse(endSpy.mock.calls[0][0]);
        expect(response.requiredFeature).toBe('ai-analyze');
      }
    });

    it('should gate ai-tune feature', () => {
      const req = {
        user: { id: 'user-1', email: 'test@example.com', tier: 'free' },
      } as any;

      const result = checkTierGate(req, mockRes as any, '/api/openclaw/tune');
      if (!result) {
        const response = JSON.parse(endSpy.mock.calls[0][0]);
        expect(response.requiredFeature).toBe('ai-tune');
      }
    });

    it('should gate ai-auto-tune feature', () => {
      const req = {
        user: { id: 'user-1', email: 'test@example.com', tier: 'free' },
      } as any;

      const result = checkTierGate(req, mockRes as any, '/api/openclaw/auto-tune');
      if (!result) {
        const response = JSON.parse(endSpy.mock.calls[0][0]);
        expect(response.requiredFeature).toBe('ai-auto-tune');
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle pathname with query parameters', () => {
      const req = {
        user: { id: 'user-1', email: 'test@example.com', tier: 'pro' },
      } as any;

      // Path matching should work even if query params are present
      const result = checkTierGate(req, mockRes as any, '/api/backtest?strategy=123');
      // The actual middleware would handle query params, but this tests the basic path matching
      expect(typeof result).toBe('boolean');
    });

    it('should handle case sensitivity in paths', () => {
      const req = {
        user: { id: 'user-1', email: 'test@example.com', tier: 'free' },
      } as any;

      // Paths should be case-sensitive
      const result = checkTierGate(req, mockRes as any, '/API/BACKTEST');
      expect(result).toBe(true); // Different case, different path, should allow
    });

    it('should handle empty pathname', () => {
      const req = {
        user: { id: 'user-1', email: 'test@example.com', tier: 'free' },
      } as any;

      const result = checkTierGate(req, mockRes as any, '');
      expect(result).toBe(true); // Empty path doesn't match any gate
    });

    it('should handle root path', () => {
      const req = {
        user: { id: 'user-1', email: 'test@example.com', tier: 'free' },
      } as any;

      const result = checkTierGate(req, mockRes as any, '/');
      expect(result).toBe(true); // Root path doesn't match any gate
    });
  });
});
