import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { checkApiRateLimit } from '../../src/api/api-rate-limiter.js';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Socket } from 'node:net';

describe('API Rate Limiter (checkApiRateLimit)', () => {
  let mockReq: Partial<IncomingMessage>;
  let mockRes: Partial<ServerResponse>;
  let writeHeadSpy: ReturnType<typeof vi.fn>;
  let setHeaderSpy: ReturnType<typeof vi.fn>;
  let endSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    writeHeadSpy = vi.fn();
    setHeaderSpy = vi.fn();
    endSpy = vi.fn();

    mockReq = {
      socket: {
        remoteAddress: '192.168.1.100',
      } as Partial<Socket>,
    };

    mockRes = {
      writeHead: writeHeadSpy,
      setHeader: setHeaderSpy,
      end: endSpy,
    } as Partial<ServerResponse>;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Authenticated users (with user object)', () => {
    it('should allow request when under free tier limit', () => {
      const req = { ...mockReq, user: { id: 'user-1', email: 'test@example.com', tier: 'free' } };
      const result = checkApiRateLimit(req as any, mockRes as any);
      expect(result).toBe(true);
      expect(writeHeadSpy).not.toHaveBeenCalled();
    });

    it('should allow multiple requests within free tier limit (10/min)', () => {
      const req = { ...mockReq, user: { id: 'user-2', email: 'test@example.com', tier: 'free' } };
      for (let i = 0; i < 10; i++) {
        const result = checkApiRateLimit(req as any, mockRes as any);
        expect(result).toBe(true);
      }
      expect(writeHeadSpy).not.toHaveBeenCalled();
    });

    it('should reject request when free tier limit exceeded', () => {
      const req = { ...mockReq, user: { id: 'user-3', email: 'test@example.com', tier: 'free' } };
      // Use up the limit
      for (let i = 0; i < 10; i++) {
        checkApiRateLimit(req as any, mockRes as any);
      }

      // 11th request should be rejected
      const result = checkApiRateLimit(req as any, mockRes as any);
      expect(result).toBe(false);
      expect(writeHeadSpy).toHaveBeenCalledWith(429, expect.any(Object));
    });

    it('should send proper 429 response body for rate limit exceed', () => {
      const req = { ...mockReq, user: { id: 'user-4', email: 'test@example.com', tier: 'free' } };
      for (let i = 0; i < 10; i++) {
        checkApiRateLimit(req as any, mockRes as any);
      }

      checkApiRateLimit(req as any, mockRes as any);
      expect(endSpy).toHaveBeenCalled();
      const response = JSON.parse(endSpy.mock.calls[0][0]);
      expect(response.error).toBe('Rate limit exceeded');
      expect(response.limit).toBe(10);
      expect(response.message).toContain('free');
    });

    it('should set Retry-After header with correct value', () => {
      const req = { ...mockReq, user: { id: 'user-5', email: 'test@example.com', tier: 'free' } };
      for (let i = 0; i < 10; i++) {
        checkApiRateLimit(req as any, mockRes as any);
      }

      checkApiRateLimit(req as any, mockRes as any);
      const calls = writeHeadSpy.mock.calls[0];
      const headers = calls[1];
      expect(headers['Retry-After']).toBeDefined();
      expect(parseInt(headers['Retry-After'], 10)).toBeGreaterThan(0);
      expect(parseInt(headers['Retry-After'], 10)).toBeLessThanOrEqual(60);
    });

    it('should allow more requests for pro tier (60/min)', () => {
      const req = { ...mockReq, user: { id: 'pro-user', email: 'test@example.com', tier: 'pro' } };
      for (let i = 0; i < 60; i++) {
        const result = checkApiRateLimit(req as any, mockRes as any);
        expect(result).toBe(true);
      }

      // 61st request should be rejected
      const result = checkApiRateLimit(req as any, mockRes as any);
      expect(result).toBe(false);
    });

    it('should allow many requests for enterprise tier (300/min)', () => {
      const req = { ...mockReq, user: { id: 'ent-user', email: 'test@example.com', tier: 'enterprise' } };
      for (let i = 0; i < 300; i++) {
        const result = checkApiRateLimit(req as any, mockRes as any);
        expect(result).toBe(true);
      }

      // 301st request should be rejected
      const result = checkApiRateLimit(req as any, mockRes as any);
      expect(result).toBe(false);
    });

    it('should set correct rate limit headers on success', () => {
      const req = { ...mockReq, user: { id: 'user-6', email: 'test@example.com', tier: 'free' } };
      checkApiRateLimit(req as any, mockRes as any);

      expect(setHeaderSpy).toHaveBeenCalledWith('X-RateLimit-Limit', '10');
      expect(setHeaderSpy).toHaveBeenCalledWith('X-RateLimit-Remaining', '9');
      expect(setHeaderSpy).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(String));
    });

    it('should reset rate limit after window expires', () => {
      const req = { ...mockReq, user: { id: 'user-7', email: 'test@example.com', tier: 'free' } };
      // Use up limit
      for (let i = 0; i < 10; i++) {
        checkApiRateLimit(req as any, mockRes as any);
      }

      let result = checkApiRateLimit(req as any, mockRes as any);
      expect(result).toBe(false);

      // Advance time by 61 seconds
      vi.advanceTimersByTime(61_000);

      // Should allow requests again
      result = checkApiRateLimit(req as any, mockRes as any);
      expect(result).toBe(true);
    });

    it('should isolate rate limits by user ID', () => {
      const req1 = { ...mockReq, user: { id: 'user-8', email: 'test@example.com', tier: 'free' } };
      const req2 = { ...mockReq, user: { id: 'user-9', email: 'test@example.com', tier: 'free' } };

      // Fill up user-8's limit
      for (let i = 0; i < 10; i++) {
        checkApiRateLimit(req1 as any, mockRes as any);
      }

      // user-8 should be limited
      let result = checkApiRateLimit(req1 as any, mockRes as any);
      expect(result).toBe(false);

      // user-9 should still have requests available
      result = checkApiRateLimit(req2 as any, mockRes as any);
      expect(result).toBe(true);
    });
  });

  describe('Unauthenticated users (IP-based fallback)', () => {
    it('should use IP address for unauthenticated requests', () => {
      const req = { ...mockReq }; // No user
      for (let i = 0; i < 10; i++) {
        checkApiRateLimit(req as any, mockRes as any);
      }

      // 11th request should be rejected (free tier limit)
      const result = checkApiRateLimit(req as any, mockRes as any);
      expect(result).toBe(false);
    });

    it('should use "unknown" as fallback when no remoteAddress', () => {
      const req = { socket: {} };
      for (let i = 0; i < 10; i++) {
        checkApiRateLimit(req as any, mockRes as any);
      }

      const result = checkApiRateLimit(req as any, mockRes as any);
      expect(result).toBe(false);
    });

    it('should track different IPs separately', () => {
      const req1 = {
        socket: { remoteAddress: '192.168.1.1' },
      };
      const req2 = {
        socket: { remoteAddress: '192.168.1.2' },
      };

      // Fill up IP1's limit
      for (let i = 0; i < 10; i++) {
        checkApiRateLimit(req1 as any, mockRes as any);
      }

      // IP1 should be limited
      let result = checkApiRateLimit(req1 as any, mockRes as any);
      expect(result).toBe(false);

      // IP2 should still have requests
      result = checkApiRateLimit(req2 as any, mockRes as any);
      expect(result).toBe(true);
    });
  });

  describe('Window expiration and cleanup', () => {
    it('should allow requests after window expires', () => {
      const req = { ...mockReq, user: { id: 'user-10', email: 'test@example.com', tier: 'free' } };

      // Fill window
      for (let i = 0; i < 10; i++) {
        checkApiRateLimit(req as any, mockRes as any);
      }

      // Hit limit
      let result = checkApiRateLimit(req as any, mockRes as any);
      expect(result).toBe(false);

      // Advance past window (60 seconds + 1)
      vi.advanceTimersByTime(61_000);

      // Should allow again
      result = checkApiRateLimit(req as any, mockRes as any);
      expect(result).toBe(true);
    });

    it('should handle multiple windows for same user', () => {
      const req = { ...mockReq, user: { id: 'user-11', email: 'test@example.com', tier: 'free' } };

      // First window
      for (let i = 0; i < 10; i++) {
        checkApiRateLimit(req as any, mockRes as any);
      }
      expect(checkApiRateLimit(req as any, mockRes as any)).toBe(false);

      // Move to next window
      vi.advanceTimersByTime(61_000);
      expect(checkApiRateLimit(req as any, mockRes as any)).toBe(true);

      // Fill up again
      for (let i = 0; i < 9; i++) {
        checkApiRateLimit(req as any, mockRes as any);
      }
      expect(checkApiRateLimit(req as any, mockRes as any)).toBe(false);
    });
  });

  describe('Error scenarios', () => {
    it('should return correct remaining count in headers', () => {
      const req = { ...mockReq, user: { id: 'user-12', email: 'test@example.com', tier: 'pro' } };

      checkApiRateLimit(req as any, mockRes as any);
      expect(setHeaderSpy).toHaveBeenCalledWith('X-RateLimit-Remaining', '59');

      checkApiRateLimit(req as any, mockRes as any);
      expect(setHeaderSpy).toHaveBeenCalledWith('X-RateLimit-Remaining', '58');
    });

    it('should include upgrade URL in rate limit response', () => {
      const req = { ...mockReq, user: { id: 'user-13', email: 'test@example.com', tier: 'free' } };
      for (let i = 0; i < 10; i++) {
        checkApiRateLimit(req as any, mockRes as any);
      }

      checkApiRateLimit(req as any, mockRes as any);
      const response = JSON.parse(endSpy.mock.calls[0][0]);
      expect(response.upgradeUrl).toBe('https://cashclaw.cc/pricing');
    });

    it('should set Content-Length header on 429 response', () => {
      const req = { ...mockReq, user: { id: 'user-14', email: 'test@example.com', tier: 'free' } };
      for (let i = 0; i < 10; i++) {
        checkApiRateLimit(req as any, mockRes as any);
      }

      checkApiRateLimit(req as any, mockRes as any);
      const headers = writeHeadSpy.mock.calls[0][1];
      expect(headers['Content-Length']).toBeDefined();
      expect(parseInt(headers['Content-Length'], 10)).toBeGreaterThan(0);
    });
  });
});
