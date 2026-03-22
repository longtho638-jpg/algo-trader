import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createAuthMiddleware, createJwt, verifyJwt } from '../../src/api/auth-middleware.js';
import { UserStore } from '../../src/users/user-store.js';
import type { AuthenticatedRequest } from '../../src/api/auth-middleware.js';
import type { User } from '../../src/users/user-store.js';
import type { ServerResponse } from 'node:http';

const TEST_DB = '/tmp/test-auth-security.db';
const JWT_SECRET = 'test-secret-key-for-jwt-hs256-security';

describe('Auth Middleware Security Tests', () => {
  let userStore: UserStore;
  let testUser: User;
  let proUser: User;

  beforeEach(() => {
    // Clean up from previous test
    try {
      const fs = require('node:fs');
      if (fs.existsSync(TEST_DB)) {
        fs.unlinkSync(TEST_DB);
      }
    } catch {
      // ignore
    }

    userStore = new UserStore(TEST_DB);
    testUser = userStore.createUser('user@example.com', 'free');
    proUser = userStore.createUser('pro@example.com', 'pro');
  });

  afterEach(() => {
    try {
      userStore.close();
      const fs = require('node:fs');
      if (fs.existsSync(TEST_DB)) {
        fs.unlinkSync(TEST_DB);
      }
    } catch {
      // ignore
    }
  });

  describe('JWT Authentication', () => {
    it('should accept valid Bearer JWT token', () => {
      const middleware = createAuthMiddleware(userStore, JWT_SECRET);
      let nextCalled = false;
      const req: AuthenticatedRequest = {
        url: '/api/strategies',
        headers: {
          authorization: `Bearer ${createJwt(testUser, JWT_SECRET)}`,
        },
      } as any;

      const res = {
        writeHead: vi.fn(),
        end: vi.fn(),
      } as unknown as ServerResponse;

      const next = () => {
        nextCalled = true;
      };

      middleware(req, res, next);

      expect(nextCalled).toBe(true);
      expect(req.user).toBeDefined();
      expect(req.user?.id).toBe(testUser.id);
      expect(req.user?.email).toBe(testUser.email);
    });

    it('should reject invalid Bearer JWT token', () => {
      const middleware = createAuthMiddleware(userStore, JWT_SECRET);
      let nextCalled = false;
      const writeHeadSpy = vi.fn();

      const req: AuthenticatedRequest = {
        url: '/api/strategies',
        headers: {
          authorization: 'Bearer invalid.jwt.token',
        },
      } as any;

      const res = {
        writeHead: writeHeadSpy,
        end: vi.fn(),
      } as unknown as ServerResponse;

      const next = () => {
        nextCalled = true;
      };

      middleware(req, res, next);

      expect(nextCalled).toBe(false);
      expect(writeHeadSpy).toHaveBeenCalledWith(401, expect.any(Object));
    });

    it('should reject expired Bearer JWT token', () => {
      const middleware = createAuthMiddleware(userStore, JWT_SECRET);
      const expiredToken = createJwt(testUser, JWT_SECRET, -10); // Already expired
      let nextCalled = false;
      const writeHeadSpy = vi.fn();

      const req: AuthenticatedRequest = {
        url: '/api/strategies',
        headers: {
          authorization: `Bearer ${expiredToken}`,
        },
      } as any;

      const res = {
        writeHead: writeHeadSpy,
        end: vi.fn(),
      } as unknown as ServerResponse;

      const next = () => {
        nextCalled = true;
      };

      middleware(req, res, next);

      expect(nextCalled).toBe(false);
      expect(writeHeadSpy).toHaveBeenCalledWith(401, expect.any(Object));
    });

    it('should reject JWT with tampered signature', () => {
      const middleware = createAuthMiddleware(userStore, JWT_SECRET);
      const token = createJwt(testUser, JWT_SECRET);
      const parts = token.split('.');
      const tamperedToken = `${parts[0]}.${parts[1]}.tampered_signature`;

      let nextCalled = false;
      const writeHeadSpy = vi.fn();

      const req: AuthenticatedRequest = {
        url: '/api/strategies',
        headers: {
          authorization: `Bearer ${tamperedToken}`,
        },
      } as any;

      const res = {
        writeHead: writeHeadSpy,
        end: vi.fn(),
      } as unknown as ServerResponse;

      const next = () => {
        nextCalled = true;
      };

      middleware(req, res, next);

      expect(nextCalled).toBe(false);
      expect(writeHeadSpy).toHaveBeenCalledWith(401, expect.any(Object));
    });

    it('should preserve tier from JWT payload', () => {
      const middleware = createAuthMiddleware(userStore, JWT_SECRET);
      let nextCalled = false;

      const req: AuthenticatedRequest = {
        url: '/api/strategies',
        headers: {
          authorization: `Bearer ${createJwt(proUser, JWT_SECRET)}`,
        },
      } as any;

      const res = {
        writeHead: vi.fn(),
        end: vi.fn(),
      } as unknown as ServerResponse;

      const next = () => {
        nextCalled = true;
      };

      middleware(req, res, next);

      expect(nextCalled).toBe(true);
      expect(req.user?.tier).toBe('pro');
    });

    it('should reject JWT with wrong secret', () => {
      const wrongSecret = 'wrong-secret';
      const token = createJwt(testUser, JWT_SECRET);
      const payload = verifyJwt(token, wrongSecret);

      expect(payload).toBeNull();
    });
  });

  describe('API Key Authentication', () => {
    it('should accept valid ApiKey in Authorization header', () => {
      const middleware = createAuthMiddleware(userStore, JWT_SECRET);
      let nextCalled = false;

      const req: AuthenticatedRequest = {
        url: '/api/strategies',
        headers: {
          authorization: `ApiKey ${testUser.apiKey}`,
        },
      } as any;

      const res = {
        writeHead: vi.fn(),
        end: vi.fn(),
      } as unknown as ServerResponse;

      const next = () => {
        nextCalled = true;
      };

      middleware(req, res, next);

      expect(nextCalled).toBe(true);
      expect(req.user).toBeDefined();
      expect(req.user?.id).toBe(testUser.id);
    });

    it('should reject invalid ApiKey in Authorization header', () => {
      const middleware = createAuthMiddleware(userStore, JWT_SECRET);
      let nextCalled = false;
      const writeHeadSpy = vi.fn();

      const req: AuthenticatedRequest = {
        url: '/api/strategies',
        headers: {
          authorization: 'ApiKey invalid-api-key',
        },
      } as any;

      const res = {
        writeHead: writeHeadSpy,
        end: vi.fn(),
      } as unknown as ServerResponse;

      const next = () => {
        nextCalled = true;
      };

      middleware(req, res, next);

      expect(nextCalled).toBe(false);
      expect(writeHeadSpy).toHaveBeenCalledWith(401, expect.any(Object));
    });

    it('should accept valid X-API-Key header (legacy)', () => {
      const middleware = createAuthMiddleware(userStore, JWT_SECRET);
      let nextCalled = false;

      const req: AuthenticatedRequest = {
        url: '/api/strategies',
        headers: {
          'x-api-key': testUser.apiKey,
        },
      } as any;

      const res = {
        writeHead: vi.fn(),
        end: vi.fn(),
      } as unknown as ServerResponse;

      const next = () => {
        nextCalled = true;
      };

      middleware(req, res, next);

      expect(nextCalled).toBe(true);
      expect(req.user).toBeDefined();
      expect(req.user?.id).toBe(testUser.id);
    });

    it('should handle X-API-Key as array (multiple values)', () => {
      const middleware = createAuthMiddleware(userStore, JWT_SECRET);
      let nextCalled = false;

      const req: AuthenticatedRequest = {
        url: '/api/strategies',
        headers: {
          'x-api-key': [testUser.apiKey, 'other-key'],
        },
      } as any;

      const res = {
        writeHead: vi.fn(),
        end: vi.fn(),
      } as unknown as ServerResponse;

      const next = () => {
        nextCalled = true;
      };

      middleware(req, res, next);

      expect(nextCalled).toBe(true);
      expect(req.user?.id).toBe(testUser.id);
    });

    it('should reject invalid X-API-Key header', () => {
      const middleware = createAuthMiddleware(userStore, JWT_SECRET);
      let nextCalled = false;
      const writeHeadSpy = vi.fn();

      const req: AuthenticatedRequest = {
        url: '/api/strategies',
        headers: {
          'x-api-key': 'invalid-key',
        },
      } as any;

      const res = {
        writeHead: writeHeadSpy,
        end: vi.fn(),
      } as unknown as ServerResponse;

      const next = () => {
        nextCalled = true;
      };

      middleware(req, res, next);

      expect(nextCalled).toBe(false);
      expect(writeHeadSpy).toHaveBeenCalledWith(401, expect.any(Object));
    });

    it('should preserve tier from API key user lookup', () => {
      const middleware = createAuthMiddleware(userStore, JWT_SECRET);
      let nextCalled = false;

      const req: AuthenticatedRequest = {
        url: '/api/strategies',
        headers: {
          authorization: `ApiKey ${proUser.apiKey}`,
        },
      } as any;

      const res = {
        writeHead: vi.fn(),
        end: vi.fn(),
      } as unknown as ServerResponse;

      const next = () => {
        nextCalled = true;
      };

      middleware(req, res, next);

      expect(nextCalled).toBe(true);
      expect(req.user?.tier).toBe('pro');
    });
  });

  describe('Public Paths', () => {
    it('should skip auth for /api/health', () => {
      const middleware = createAuthMiddleware(userStore, JWT_SECRET);
      let nextCalled = false;

      const req: AuthenticatedRequest = {
        url: '/api/health',
        headers: {},
      } as any;

      const res = {
        writeHead: vi.fn(),
        end: vi.fn(),
      } as unknown as ServerResponse;

      const next = () => {
        nextCalled = true;
      };

      middleware(req, res, next);

      expect(nextCalled).toBe(true);
      expect(req.user).toBeUndefined();
    });

    it('should skip auth for /api/auth/register', () => {
      const middleware = createAuthMiddleware(userStore, JWT_SECRET);
      let nextCalled = false;

      const req: AuthenticatedRequest = {
        url: '/api/auth/register',
        headers: {},
      } as any;

      const res = {
        writeHead: vi.fn(),
        end: vi.fn(),
      } as unknown as ServerResponse;

      const next = () => {
        nextCalled = true;
      };

      middleware(req, res, next);

      expect(nextCalled).toBe(true);
    });

    it('should skip auth for /api/auth/login', () => {
      const middleware = createAuthMiddleware(userStore, JWT_SECRET);
      let nextCalled = false;

      const req: AuthenticatedRequest = {
        url: '/api/auth/login',
        headers: {},
      } as any;

      const res = {
        writeHead: vi.fn(),
        end: vi.fn(),
      } as unknown as ServerResponse;

      const next = () => {
        nextCalled = true;
      };

      middleware(req, res, next);

      expect(nextCalled).toBe(true);
    });

    it('should skip auth for /api/webhooks/polar', () => {
      const middleware = createAuthMiddleware(userStore, JWT_SECRET);
      let nextCalled = false;

      const req: AuthenticatedRequest = {
        url: '/api/webhooks/polar',
        headers: {},
      } as any;

      const res = {
        writeHead: vi.fn(),
        end: vi.fn(),
      } as unknown as ServerResponse;

      const next = () => {
        nextCalled = true;
      };

      middleware(req, res, next);

      expect(nextCalled).toBe(true);
    });

    it('should skip auth for /api/webhooks/tradingview/* paths', () => {
      const middleware = createAuthMiddleware(userStore, JWT_SECRET);
      let nextCalled = false;

      const req: AuthenticatedRequest = {
        url: '/api/webhooks/tradingview/user123',
        headers: {},
      } as any;

      const res = {
        writeHead: vi.fn(),
        end: vi.fn(),
      } as unknown as ServerResponse;

      const next = () => {
        nextCalled = true;
      };

      middleware(req, res, next);

      expect(nextCalled).toBe(true);
    });

    it('should skip auth for /api/docs', () => {
      const middleware = createAuthMiddleware(userStore, JWT_SECRET);
      let nextCalled = false;

      const req: AuthenticatedRequest = {
        url: '/api/docs',
        headers: {},
      } as any;

      const res = {
        writeHead: vi.fn(),
        end: vi.fn(),
      } as unknown as ServerResponse;

      const next = () => {
        nextCalled = true;
      };

      middleware(req, res, next);

      expect(nextCalled).toBe(true);
    });

    it('should require auth for protected paths', () => {
      const middleware = createAuthMiddleware(userStore, JWT_SECRET);
      let nextCalled = false;
      const writeHeadSpy = vi.fn();

      const req: AuthenticatedRequest = {
        url: '/api/strategies',
        headers: {},
      } as any;

      const res = {
        writeHead: writeHeadSpy,
        end: vi.fn(),
      } as unknown as ServerResponse;

      const next = () => {
        nextCalled = true;
      };

      middleware(req, res, next);

      expect(nextCalled).toBe(false);
      expect(writeHeadSpy).toHaveBeenCalledWith(401, expect.any(Object));
    });
  });

  describe('Missing Headers', () => {
    it('should reject request with no auth header', () => {
      const middleware = createAuthMiddleware(userStore, JWT_SECRET);
      let nextCalled = false;
      const writeHeadSpy = vi.fn();
      const endSpy = vi.fn();

      const req: AuthenticatedRequest = {
        url: '/api/strategies',
        headers: {},
      } as any;

      const res = {
        writeHead: writeHeadSpy,
        end: endSpy,
      } as unknown as ServerResponse;

      const next = () => {
        nextCalled = true;
      };

      middleware(req, res, next);

      expect(nextCalled).toBe(false);
      expect(writeHeadSpy).toHaveBeenCalledWith(401, expect.any(Object));
      const response = JSON.parse(endSpy.mock.calls[0][0]);
      expect(response.error).toBe('Unauthorized');
      expect(response.message).toContain('Missing Authorization header');
    });

    it('should set correct 401 response headers', () => {
      const middleware = createAuthMiddleware(userStore, JWT_SECRET);
      const writeHeadSpy = vi.fn();

      const req: AuthenticatedRequest = {
        url: '/api/strategies',
        headers: {},
      } as any;

      const res = {
        writeHead: writeHeadSpy,
        end: vi.fn(),
      } as unknown as ServerResponse;

      middleware(req, res, () => {});

      const headers = writeHeadSpy.mock.calls[0][1];
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['Content-Length']).toBeDefined();
    });
  });

  describe('Priority and Order', () => {
    it('should prefer Bearer JWT over API key', () => {
      const middleware = createAuthMiddleware(userStore, JWT_SECRET);
      let nextCalled = false;

      const req: AuthenticatedRequest = {
        url: '/api/strategies',
        headers: {
          authorization: `Bearer ${createJwt(testUser, JWT_SECRET)}`,
          'x-api-key': proUser.apiKey,
        },
      } as any;

      const res = {
        writeHead: vi.fn(),
        end: vi.fn(),
      } as unknown as ServerResponse;

      const next = () => {
        nextCalled = true;
      };

      middleware(req, res, next);

      // Should authenticate as testUser (from JWT), not proUser (from API key)
      expect(nextCalled).toBe(true);
      expect(req.user?.id).toBe(testUser.id);
    });

    it('should prefer ApiKey header over X-API-Key', () => {
      const middleware = createAuthMiddleware(userStore, JWT_SECRET);
      let nextCalled = false;

      const req: AuthenticatedRequest = {
        url: '/api/strategies',
        headers: {
          authorization: `ApiKey ${testUser.apiKey}`,
          'x-api-key': proUser.apiKey,
        },
      } as any;

      const res = {
        writeHead: vi.fn(),
        end: vi.fn(),
      } as unknown as ServerResponse;

      const next = () => {
        nextCalled = true;
      };

      middleware(req, res, next);

      // Should authenticate as testUser (from Authorization header), not proUser (from X-API-Key)
      expect(nextCalled).toBe(true);
      expect(req.user?.id).toBe(testUser.id);
    });
  });
});
