import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createServer, ServerResponse } from 'node:http';
import type { IncomingMessage } from 'node:http';
import {
  applySecurityHeaders,
} from '../../src/api/security-headers-middleware.js';
import {
  validateBody,
  sanitizeString,
  type ValidationRule,
} from '../../src/api/input-validation-middleware.js';
import { createBodyLimitMiddleware } from '../../src/api/request-body-limit-middleware.js';

describe('applySecurityHeaders', () => {
  let res: ServerResponse;
  let setHeaderSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setHeaderSpy = vi.fn();
    res = {
      setHeader: setHeaderSpy,
    } as unknown as ServerResponse;
  });

  it('should set X-Content-Type-Options header', () => {
    applySecurityHeaders({} as IncomingMessage, res);
    expect(setHeaderSpy).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
  });

  it('should set X-Frame-Options header', () => {
    applySecurityHeaders({} as IncomingMessage, res);
    expect(setHeaderSpy).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
  });

  it('should set X-XSS-Protection header', () => {
    applySecurityHeaders({} as IncomingMessage, res);
    expect(setHeaderSpy).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
  });

  it('should set Strict-Transport-Security header', () => {
    applySecurityHeaders({} as IncomingMessage, res);
    expect(setHeaderSpy).toHaveBeenCalledWith(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains'
    );
  });

  it('should set Content-Security-Policy header', () => {
    applySecurityHeaders({} as IncomingMessage, res);
    expect(setHeaderSpy).toHaveBeenCalledWith(
      'Content-Security-Policy',
      "default-src 'self'"
    );
  });

  it('should set Referrer-Policy header', () => {
    applySecurityHeaders({} as IncomingMessage, res);
    expect(setHeaderSpy).toHaveBeenCalledWith(
      'Referrer-Policy',
      'strict-origin-when-cross-origin'
    );
  });

  it('should set Permissions-Policy header', () => {
    applySecurityHeaders({} as IncomingMessage, res);
    expect(setHeaderSpy).toHaveBeenCalledWith(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=()'
    );
  });

  it('should set all 7 security headers in one call', () => {
    applySecurityHeaders({} as IncomingMessage, res);
    expect(setHeaderSpy).toHaveBeenCalledTimes(7);
  });
});

describe('validateBody', () => {
  it('should validate required string field', () => {
    const body = { name: 'John' };
    const rules: ValidationRule[] = [{ field: 'name', type: 'string', required: true }];
    const result = validateBody(body, rules);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject missing required field', () => {
    const body = {};
    const rules: ValidationRule[] = [{ field: 'email', type: 'string', required: true }];
    const result = validateBody(body, rules);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Field 'email' is required");
  });

  it('should reject wrong type', () => {
    const body = { count: 'not-a-number' };
    const rules: ValidationRule[] = [{ field: 'count', type: 'number', required: true }];
    const result = validateBody(body, rules);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('must be of type number');
  });

  it('should validate number type', () => {
    const body = { amount: 100 };
    const rules: ValidationRule[] = [{ field: 'amount', type: 'number', required: true }];
    const result = validateBody(body, rules);
    expect(result.valid).toBe(true);
  });

  it('should validate boolean type', () => {
    const body = { enabled: true };
    const rules: ValidationRule[] = [{ field: 'enabled', type: 'boolean', required: true }];
    const result = validateBody(body, rules);
    expect(result.valid).toBe(true);
  });

  it('should enforce maxLength constraint', () => {
    const body = { username: 'a'.repeat(101) };
    const rules: ValidationRule[] = [
      { field: 'username', type: 'string', required: true, maxLength: 100 }
    ];
    const result = validateBody(body, rules);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('exceeds max length');
  });

  it('should allow optional fields when not provided', () => {
    const body = { name: 'John' };
    const rules: ValidationRule[] = [
      { field: 'name', type: 'string', required: true },
      { field: 'nickname', type: 'string', required: false }
    ];
    const result = validateBody(body, rules);
    expect(result.valid).toBe(true);
  });

  it('should validate multiple fields', () => {
    const body = { email: 'test@example.com', age: 25 };
    const rules: ValidationRule[] = [
      { field: 'email', type: 'string', required: true },
      { field: 'age', type: 'number', required: true }
    ];
    const result = validateBody(body, rules);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

describe('sanitizeString', () => {
  it('should strip control characters', () => {
    const input = 'hello\x00world';
    const result = sanitizeString(input);
    expect(result).toBe('helloworld');
  });

  it('should strip null bytes', () => {
    const input = 'test\x00string';
    const result = sanitizeString(input);
    expect(result).toBe('teststring');
  });

  it('should trim whitespace', () => {
    const input = '  hello world  ';
    const result = sanitizeString(input);
    expect(result).toBe('hello world');
  });

  it('should strip tab and form feed characters', () => {
    const input = 'hello\x08world\x0Ctest';
    const result = sanitizeString(input);
    expect(result).toBe('helloworldtest');
  });

  it('should handle normal input', () => {
    const input = 'normal text';
    const result = sanitizeString(input);
    expect(result).toBe('normal text');
  });

  it('should strip multiple control chars in sequence', () => {
    const input = 'a\x00\x01\x02b';
    const result = sanitizeString(input);
    expect(result).toBe('ab');
  });
});

describe('createBodyLimitMiddleware', () => {
  it('should reject Content-Length exceeding limit', () => {
    const middleware = createBodyLimitMiddleware(1000);
    const req = {
      headers: { 'content-length': '2000' },
    } as unknown as IncomingMessage;
    const res = {
      headersSent: false,
      writeHead: vi.fn(),
      end: vi.fn(),
    } as unknown as ServerResponse;
    const next = vi.fn();

    middleware(req, res, next);
    expect(res.writeHead).toHaveBeenCalledWith(413, { 'Content-Type': 'application/json' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should allow Content-Length within limit', () => {
    const middleware = createBodyLimitMiddleware(1000);
    const req = {
      headers: { 'content-length': '500' },
      on: vi.fn((event, callback) => {
        if (event === 'end') callback();
      }),
    } as unknown as IncomingMessage;
    const res = { headersSent: false } as unknown as ServerResponse;
    const next = vi.fn();

    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should use default 1MB limit', () => {
    const middleware = createBodyLimitMiddleware();
    const req = {
      headers: { 'content-length': String(2 * 1024 * 1024) },
    } as unknown as IncomingMessage;
    const res = {
      headersSent: false,
      writeHead: vi.fn(),
      end: vi.fn(),
    } as unknown as ServerResponse;
    const next = vi.fn();

    middleware(req, res, next);
    expect(res.writeHead).toHaveBeenCalledWith(413, expect.anything());
  });

  it('should handle missing Content-Length header', () => {
    const middleware = createBodyLimitMiddleware(1000);
    const req = {
      headers: {},
      on: vi.fn((event, callback) => {
        if (event === 'end') callback();
      }),
    } as unknown as IncomingMessage;
    const res = { headersSent: false } as unknown as ServerResponse;
    const next = vi.fn();

    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
