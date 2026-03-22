import { describe, it, expect, beforeEach, vi } from 'vitest';
import { applySecurityHeaders } from '../../src/api/security-headers-middleware.js';
import type { IncomingMessage, ServerResponse } from 'node:http';

describe('Security Headers Middleware (applySecurityHeaders)', () => {
  let mockRes: Partial<ServerResponse>;
  let setHeaderSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    setHeaderSpy = vi.fn();

    mockRes = {
      setHeader: setHeaderSpy,
    } as Partial<ServerResponse>;
  });

  describe('OWASP Security Headers', () => {
    it('should set X-Content-Type-Options to nosniff', () => {
      applySecurityHeaders({} as IncomingMessage, mockRes as any);

      expect(setHeaderSpy).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    });

    it('should set X-Frame-Options to DENY', () => {
      applySecurityHeaders({} as IncomingMessage, mockRes as any);

      expect(setHeaderSpy).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
    });

    it('should set X-XSS-Protection to 1; mode=block', () => {
      applySecurityHeaders({} as IncomingMessage, mockRes as any);

      expect(setHeaderSpy).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
    });

    it('should set Strict-Transport-Security with 1 year max-age', () => {
      applySecurityHeaders({} as IncomingMessage, mockRes as any);

      expect(setHeaderSpy).toHaveBeenCalledWith(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains'
      );
    });

    it('should include includeSubDomains in HSTS header', () => {
      applySecurityHeaders({} as IncomingMessage, mockRes as any);

      const calls = setHeaderSpy.mock.calls.filter(
        (call) => call[0] === 'Strict-Transport-Security'
      );
      expect(calls[0][1]).toContain('includeSubDomains');
    });

    it('should set Content-Security-Policy to default-src self', () => {
      applySecurityHeaders({} as IncomingMessage, mockRes as any);

      expect(setHeaderSpy).toHaveBeenCalledWith(
        'Content-Security-Policy',
        "default-src 'self'"
      );
    });

    it('should set Referrer-Policy to strict-origin-when-cross-origin', () => {
      applySecurityHeaders({} as IncomingMessage, mockRes as any);

      expect(setHeaderSpy).toHaveBeenCalledWith(
        'Referrer-Policy',
        'strict-origin-when-cross-origin'
      );
    });

    it('should set Permissions-Policy to disable sensitive APIs', () => {
      applySecurityHeaders({} as IncomingMessage, mockRes as any);

      expect(setHeaderSpy).toHaveBeenCalledWith(
        'Permissions-Policy',
        'camera=(), microphone=(), geolocation=()'
      );
    });
  });

  describe('Header Count and Completeness', () => {
    it('should set exactly 7 security headers', () => {
      applySecurityHeaders({} as IncomingMessage, mockRes as any);

      expect(setHeaderSpy).toHaveBeenCalledTimes(7);
    });

    it('should include all standard OWASP headers', () => {
      applySecurityHeaders({} as IncomingMessage, mockRes as any);

      const expectedHeaders = [
        'X-Content-Type-Options',
        'X-Frame-Options',
        'X-XSS-Protection',
        'Strict-Transport-Security',
        'Content-Security-Policy',
        'Referrer-Policy',
        'Permissions-Policy',
      ];

      const actualHeaders = setHeaderSpy.mock.calls.map((call) => call[0]);

      expectedHeaders.forEach((header) => {
        expect(actualHeaders).toContain(header);
      });
    });
  });

  describe('Clickjacking Protection', () => {
    it('should prevent page embedding with X-Frame-Options DENY', () => {
      applySecurityHeaders({} as IncomingMessage, mockRes as any);

      expect(setHeaderSpy).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
    });

    it('should not allow framing with alternative values', () => {
      applySecurityHeaders({} as IncomingMessage, mockRes as any);

      const calls = setHeaderSpy.mock.calls.filter(
        (call) => call[0] === 'X-Frame-Options'
      );
      expect(calls[0][1]).toBe('DENY'); // Must be exact DENY, not SAMEORIGIN or ALLOWALL
    });
  });

  describe('MIME-Type Sniffing Protection', () => {
    it('should prevent MIME-type sniffing', () => {
      applySecurityHeaders({} as IncomingMessage, mockRes as any);

      expect(setHeaderSpy).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    });

    it('should not allow other values for X-Content-Type-Options', () => {
      applySecurityHeaders({} as IncomingMessage, mockRes as any);

      const calls = setHeaderSpy.mock.calls.filter(
        (call) => call[0] === 'X-Content-Type-Options'
      );
      expect(calls[0][1]).toBe('nosniff');
    });
  });

  describe('HSTS Strength', () => {
    it('should set HSTS with minimum 1 year (31536000 seconds)', () => {
      applySecurityHeaders({} as IncomingMessage, mockRes as any);

      const calls = setHeaderSpy.mock.calls.filter(
        (call) => call[0] === 'Strict-Transport-Security'
      );
      const value = calls[0][1];

      expect(value).toContain('max-age=31536000');
    });

    it('should enforce HSTS on subdomains', () => {
      applySecurityHeaders({} as IncomingMessage, mockRes as any);

      const calls = setHeaderSpy.mock.calls.filter(
        (call) => call[0] === 'Strict-Transport-Security'
      );
      const value = calls[0][1];

      expect(value).toContain('includeSubDomains');
    });
  });

  describe('CSP Restrictiveness', () => {
    it('should set restrictive CSP default-src self only', () => {
      applySecurityHeaders({} as IncomingMessage, mockRes as any);

      const calls = setHeaderSpy.mock.calls.filter(
        (call) => call[0] === 'Content-Security-Policy'
      );
      expect(calls[0][1]).toBe("default-src 'self'");
    });

    it('should not allow unsafe CSP directives', () => {
      applySecurityHeaders({} as IncomingMessage, mockRes as any);

      const calls = setHeaderSpy.mock.calls.filter(
        (call) => call[0] === 'Content-Security-Policy'
      );
      const value = calls[0][1];

      expect(value).not.toContain('unsafe-inline');
      expect(value).not.toContain('unsafe-eval');
    });

    it('should restrict CSP to same-origin only', () => {
      applySecurityHeaders({} as IncomingMessage, mockRes as any);

      const calls = setHeaderSpy.mock.calls.filter(
        (call) => call[0] === 'Content-Security-Policy'
      );
      const value = calls[0][1];

      expect(value).toContain("'self'");
    });
  });

  describe('API Restriction', () => {
    it('should disable camera access via Permissions-Policy', () => {
      applySecurityHeaders({} as IncomingMessage, mockRes as any);

      const calls = setHeaderSpy.mock.calls.filter(
        (call) => call[0] === 'Permissions-Policy'
      );
      const value = calls[0][1];

      expect(value).toContain('camera=()');
    });

    it('should disable microphone access via Permissions-Policy', () => {
      applySecurityHeaders({} as IncomingMessage, mockRes as any);

      const calls = setHeaderSpy.mock.calls.filter(
        (call) => call[0] === 'Permissions-Policy'
      );
      const value = calls[0][1];

      expect(value).toContain('microphone=()');
    });

    it('should disable geolocation access via Permissions-Policy', () => {
      applySecurityHeaders({} as IncomingMessage, mockRes as any);

      const calls = setHeaderSpy.mock.calls.filter(
        (call) => call[0] === 'Permissions-Policy'
      );
      const value = calls[0][1];

      expect(value).toContain('geolocation=()');
    });

    it('should deny all restricted APIs with empty parentheses', () => {
      applySecurityHeaders({} as IncomingMessage, mockRes as any);

      const calls = setHeaderSpy.mock.calls.filter(
        (call) => call[0] === 'Permissions-Policy'
      );
      const value = calls[0][1];

      // All APIs should end with =()
      const apis = value.split(',').map((s) => s.trim());
      apis.forEach((api) => {
        expect(api).toMatch(/=\(\)$/);
      });
    });
  });

  describe('Referrer Policy', () => {
    it('should set Referrer-Policy to strict-origin-when-cross-origin', () => {
      applySecurityHeaders({} as IncomingMessage, mockRes as any);

      expect(setHeaderSpy).toHaveBeenCalledWith(
        'Referrer-Policy',
        'strict-origin-when-cross-origin'
      );
    });

    it('should restrict referrer to prevent leakage', () => {
      applySecurityHeaders({} as IncomingMessage, mockRes as any);

      const calls = setHeaderSpy.mock.calls.filter(
        (call) => call[0] === 'Referrer-Policy'
      );
      const value = calls[0][1];

      // strict-origin-when-cross-origin is good balance between privacy and functionality
      expect(value).toBe('strict-origin-when-cross-origin');
    });
  });

  describe('XSS Protection', () => {
    it('should set X-XSS-Protection to mode=block', () => {
      applySecurityHeaders({} as IncomingMessage, mockRes as any);

      const calls = setHeaderSpy.mock.calls.filter(
        (call) => call[0] === 'X-XSS-Protection'
      );
      expect(calls[0][1]).toContain('mode=block');
    });

    it('should enable legacy XSS filter in older browsers', () => {
      applySecurityHeaders({} as IncomingMessage, mockRes as any);

      const calls = setHeaderSpy.mock.calls.filter(
        (call) => call[0] === 'X-XSS-Protection'
      );
      expect(calls[0][1]).toBe('1; mode=block');
    });
  });

  describe('Multiple Calls', () => {
    it('should apply same headers on multiple calls', () => {
      applySecurityHeaders({} as IncomingMessage, mockRes as any);
      const firstCallCount = setHeaderSpy.mock.calls.length;

      setHeaderSpy.mockClear();

      applySecurityHeaders({} as IncomingMessage, mockRes as any);
      const secondCallCount = setHeaderSpy.mock.calls.length;

      expect(firstCallCount).toBe(secondCallCount);
    });

    it('should consistently set headers with same values', () => {
      applySecurityHeaders({} as IncomingMessage, mockRes as any);
      const firstCalls = [...setHeaderSpy.mock.calls];

      setHeaderSpy.mockClear();

      applySecurityHeaders({} as IncomingMessage, mockRes as any);
      const secondCalls = [...setHeaderSpy.mock.calls];

      firstCalls.forEach((firstCall, index) => {
        expect(secondCalls[index]).toEqual(firstCall);
      });
    });
  });

  describe('Request Parameter Handling', () => {
    it('should work regardless of request content', () => {
      const req = {
        headers: { 'user-agent': 'test' },
        method: 'POST',
      } as IncomingMessage;

      const result = applySecurityHeaders(req, mockRes as any);
      expect(setHeaderSpy).toHaveBeenCalledTimes(7);
    });

    it('should not depend on request method', () => {
      const reqGET = { method: 'GET' } as IncomingMessage;
      const reqPOST = { method: 'POST' } as IncomingMessage;

      applySecurityHeaders(reqGET, mockRes as any);
      const getCallCount = setHeaderSpy.mock.calls.length;

      setHeaderSpy.mockClear();

      applySecurityHeaders(reqPOST, mockRes as any);
      const postCallCount = setHeaderSpy.mock.calls.length;

      expect(getCallCount).toBe(postCallCount);
    });

    it('should not depend on request path', () => {
      const req1 = { url: '/api/public' } as IncomingMessage;
      const req2 = { url: '/api/private' } as IncomingMessage;

      applySecurityHeaders(req1, mockRes as any);
      const firstCallCount = setHeaderSpy.mock.calls.length;

      setHeaderSpy.mockClear();

      applySecurityHeaders(req2, mockRes as any);
      const secondCallCount = setHeaderSpy.mock.calls.length;

      expect(firstCallCount).toBe(secondCallCount);
    });
  });

  describe('Browser Compatibility', () => {
    it('should include header for legacy browsers (X-XSS-Protection)', () => {
      applySecurityHeaders({} as IncomingMessage, mockRes as any);

      expect(setHeaderSpy).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
    });

    it('should include header for older IE versions (X-Content-Type-Options)', () => {
      applySecurityHeaders({} as IncomingMessage, mockRes as any);

      expect(setHeaderSpy).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    });

    it('should include modern headers (Permissions-Policy)', () => {
      applySecurityHeaders({} as IncomingMessage, mockRes as any);

      expect(setHeaderSpy).toHaveBeenCalledWith(
        'Permissions-Policy',
        'camera=(), microphone=(), geolocation=()'
      );
    });
  });

  describe('Defense in Depth', () => {
    it('should apply multiple layers of protection', () => {
      applySecurityHeaders({} as IncomingMessage, mockRes as any);

      const headerCount = setHeaderSpy.mock.calls.length;
      expect(headerCount).toBeGreaterThanOrEqual(6);

      // Should have clickjacking + MIME-type sniffing + XSS + HSTS + CSP + API restriction
      const headers = setHeaderSpy.mock.calls.map((call) => call[0]);
      expect(headers).toContain('X-Frame-Options'); // Clickjacking
      expect(headers).toContain('X-Content-Type-Options'); // MIME sniffing
      expect(headers).toContain('X-XSS-Protection'); // XSS
      expect(headers).toContain('Strict-Transport-Security'); // HSTS
      expect(headers).toContain('Content-Security-Policy'); // CSP
      expect(headers).toContain('Permissions-Policy'); // API restriction
    });
  });
});
