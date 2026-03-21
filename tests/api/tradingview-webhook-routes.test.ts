import { describe, it, expect, beforeEach } from 'vitest';
import { handleTradingViewRoutes } from '../../src/api/tradingview-webhook-routes.js';
import { UserStore } from '../../src/users/user-store.js';
import { generateWebhookSecret } from '../../src/webhooks/tradingview-handler.js';
import type { AuthenticatedRequest } from '../../src/api/auth-middleware.js';

const TEST_DB = '/tmp/test-tv-webhook-users.db';

describe('TradingView Webhook Routes', () => {
  let userStore: UserStore;

  beforeEach(() => {
    // Clean up DB from previous test
    try {
      const fs = require('node:fs');
      if (fs.existsSync(TEST_DB)) {
        fs.unlinkSync(TEST_DB);
      }
    } catch {
      // ignore
    }
    userStore = new UserStore(TEST_DB);
  });

  describe('POST /api/webhooks/tradingview/:userId', () => {
    it('should return 401 when X-TV-Secret header missing', async () => {
      let status = 0;
      const req = {
        method: 'POST',
        headers: {},
        on: (evt: string, cb: any) => {
          if (evt === 'data') {
            cb(Buffer.from('{"ticker":"AAPL","action":"buy","price":150}'));
          }
          if (evt === 'end') cb();
        },
      } as any;
      const res = {
        writeHead: (s: number) => { status = s; },
        end: () => {},
      } as any;

      const handled = await handleTradingViewRoutes(req, res, '/api/webhooks/tradingview/user-1', userStore);
      expect(handled).toBe(true);
      expect(status).toBe(401);
    });

    it('should return 401 when X-TV-Secret is invalid', async () => {
      const user = userStore.createUser('test@example.com', 'pro');
      const validSecret = generateWebhookSecret();
      userStore.updateTvWebhookSecret(user.id, validSecret);

      let status = 0;
      const req = {
        method: 'POST',
        headers: { 'x-tv-secret': 'invalid-secret' },
        on: (evt: string, cb: any) => {
          if (evt === 'data') {
            cb(Buffer.from('{"ticker":"AAPL","action":"buy","price":150}'));
          }
          if (evt === 'end') cb();
        },
      } as any;
      const res = {
        writeHead: (s: number) => { status = s; },
        end: () => {},
      } as any;

      const handled = await handleTradingViewRoutes(req, res, `/api/webhooks/tradingview/${user.id}`, userStore);
      expect(handled).toBe(true);
      expect(status).toBe(401);
    });

    it('should return 400 when body is empty', async () => {
      const user = userStore.createUser('test@example.com', 'pro');
      const secret = generateWebhookSecret();
      userStore.updateTvWebhookSecret(user.id, secret);

      let status = 0;
      const req = {
        method: 'POST',
        headers: { 'x-tv-secret': secret },
        on: (evt: string, cb: any) => {
          if (evt === 'data') {
            cb(Buffer.from(''));
          }
          if (evt === 'end') cb();
        },
      } as any;
      const res = {
        writeHead: (s: number) => { status = s; },
        end: () => {},
      } as any;

      const handled = await handleTradingViewRoutes(req, res, `/api/webhooks/tradingview/${user.id}`, userStore);
      expect(handled).toBe(true);
      expect(status).toBe(400);
    });

    it('should accept JSON format alert with valid secret', async () => {
      const user = userStore.createUser('test@example.com', 'pro');
      const secret = generateWebhookSecret();
      userStore.updateTvWebhookSecret(user.id, secret);

      let status = 0;
      let responseData = '';
      const req = {
        method: 'POST',
        headers: { 'x-tv-secret': secret },
        on: (evt: string, cb: any) => {
          if (evt === 'data') {
            cb(Buffer.from(JSON.stringify({
              ticker: 'POLYMARKET:BTCUSD',
              action: 'buy',
              price: 45000,
              time: '2024-01-01T12:00:00Z',
            })));
          }
          if (evt === 'end') cb();
        },
      } as any;
      const res = {
        writeHead: (s: number) => { status = s; },
        end: (data: string) => { responseData = data; },
      } as any;

      const handled = await handleTradingViewRoutes(req, res, `/api/webhooks/tradingview/${user.id}`, userStore);
      expect(handled).toBe(true);
      expect(status).toBe(200);
      const parsed = JSON.parse(responseData);
      expect(parsed.ok).toBe(true);
      expect(parsed.ticker).toBe('POLYMARKET:BTCUSD');
      expect(parsed.action).toBe('buy');
    });

    it('should accept text format alert with valid secret', async () => {
      const user = userStore.createUser('test@example.com', 'pro');
      const secret = generateWebhookSecret();
      userStore.updateTvWebhookSecret(user.id, secret);

      let status = 0;
      let responseData = '';
      const req = {
        method: 'POST',
        headers: { 'x-tv-secret': secret },
        on: (evt: string, cb: any) => {
          if (evt === 'data') {
            cb(Buffer.from('POLYMARKET:BTCUSD buy @ 45000.5'));
          }
          if (evt === 'end') cb();
        },
      } as any;
      const res = {
        writeHead: (s: number) => { status = s; },
        end: (data: string) => { responseData = data; },
      } as any;

      const handled = await handleTradingViewRoutes(req, res, `/api/webhooks/tradingview/${user.id}`, userStore);
      expect(handled).toBe(true);
      expect(status).toBe(200);
      const parsed = JSON.parse(responseData);
      expect(parsed.ok).toBe(true);
      expect(parsed.ticker).toBe('POLYMARKET:BTCUSD');
    });

    it('should return 400 for invalid signal format', async () => {
      const user = userStore.createUser('test@example.com', 'pro');
      const secret = generateWebhookSecret();
      userStore.updateTvWebhookSecret(user.id, secret);

      let status = 0;
      const req = {
        method: 'POST',
        headers: { 'x-tv-secret': secret },
        on: (evt: string, cb: any) => {
          if (evt === 'data') {
            cb(Buffer.from(JSON.stringify({
              ticker: 'INVALID',
              action: 'invalid_action',
              price: 100,
            })));
          }
          if (evt === 'end') cb();
        },
      } as any;
      const res = {
        writeHead: (s: number) => { status = s; },
        end: () => {},
      } as any;

      const handled = await handleTradingViewRoutes(req, res, `/api/webhooks/tradingview/${user.id}`, userStore);
      expect(handled).toBe(true);
      expect(status).toBe(400);
    });

    it('should reject non-POST method', async () => {
      const user = userStore.createUser('test@example.com', 'pro');

      let status = 0;
      const req = {
        method: 'GET',
        headers: {},
      } as any;
      const res = {
        writeHead: (s: number) => { status = s; },
        end: () => {},
      } as any;

      const handled = await handleTradingViewRoutes(req, res, `/api/webhooks/tradingview/${user.id}`, userStore);
      expect(handled).toBe(true);
      expect(status).toBe(405);
    });
  });

  describe('POST /api/tv/generate-secret', () => {
    it('should return 401 when not authenticated', async () => {
      let status = 0;
      const req = {
        method: 'POST',
        user: undefined,
      } as AuthenticatedRequest;
      const res = {
        writeHead: (s: number) => { status = s; },
        end: () => {},
      } as any;

      const handled = await handleTradingViewRoutes(req, res, '/api/tv/generate-secret', userStore);
      expect(handled).toBe(true);
      expect(status).toBe(401);
    });

    it('should generate and return webhook secret for authenticated user', async () => {
      const user = userStore.createUser('test@example.com', 'pro');

      let status = 0;
      let responseData = '';
      const req = {
        method: 'POST',
        user: { id: user.id, tier: 'pro' },
      } as AuthenticatedRequest;
      const res = {
        writeHead: (s: number) => { status = s; },
        end: (data: string) => { responseData = data; },
      } as any;

      const handled = await handleTradingViewRoutes(req, res, '/api/tv/generate-secret', userStore);
      expect(handled).toBe(true);
      expect(status).toBe(200);
      const parsed = JSON.parse(responseData);
      expect(parsed.secret).toBeTruthy();
      expect(parsed.webhookUrl).toBeTruthy();
      expect(parsed.webhookUrl).toContain(user.id);
    });

    it('should update existing secret', async () => {
      const user = userStore.createUser('test@example.com', 'pro');

      // Generate first secret
      let responseData1 = '';
      const req1 = {
        method: 'POST',
        user: { id: user.id, tier: 'pro' },
      } as AuthenticatedRequest;
      const res1 = {
        writeHead: () => {},
        end: (data: string) => { responseData1 = data; },
      } as any;

      await handleTradingViewRoutes(req1, res1, '/api/tv/generate-secret', userStore);
      const secret1 = JSON.parse(responseData1).secret;

      // Generate second secret
      let responseData2 = '';
      const req2 = {
        method: 'POST',
        user: { id: user.id, tier: 'pro' },
      } as AuthenticatedRequest;
      const res2 = {
        writeHead: () => {},
        end: (data: string) => { responseData2 = data; },
      } as any;

      await handleTradingViewRoutes(req2, res2, '/api/tv/generate-secret', userStore);
      const secret2 = JSON.parse(responseData2).secret;

      // Secrets should be different
      expect(secret1).not.toBe(secret2);
    });

    it('should reject non-POST method', async () => {
      const user = userStore.createUser('test@example.com', 'pro');

      let status = 0;
      const req = {
        method: 'GET',
        user: { id: user.id, tier: 'pro' },
      } as AuthenticatedRequest;
      const res = {
        writeHead: (s: number) => { status = s; },
        end: () => {},
      } as any;

      const handled = await handleTradingViewRoutes(req, res, '/api/tv/generate-secret', userStore);
      expect(handled).toBe(true);
      expect(status).toBe(405);
    });

    it('should return 404 if user not found', async () => {
      let status = 0;
      const req = {
        method: 'POST',
        user: { id: 'nonexistent-user', tier: 'pro' },
      } as AuthenticatedRequest;
      const res = {
        writeHead: (s: number) => { status = s; },
        end: () => {},
      } as any;

      const handled = await handleTradingViewRoutes(req, res, '/api/tv/generate-secret', userStore);
      expect(handled).toBe(true);
      expect(status).toBe(404);
    });
  });

  describe('GET /api/tv/my-webhook', () => {
    it('should return 401 when not authenticated', async () => {
      let status = 0;
      const req = {
        method: 'GET',
        user: undefined,
      } as AuthenticatedRequest;
      const res = {
        writeHead: (s: number) => { status = s; },
        end: () => {},
      } as any;

      const handled = await handleTradingViewRoutes(req, res, '/api/tv/my-webhook', userStore);
      expect(handled).toBe(true);
      expect(status).toBe(401);
    });

    it('should return webhook URL and instructions for authenticated user', async () => {
      const user = userStore.createUser('test@example.com', 'pro');

      let status = 0;
      let responseData = '';
      const req = {
        method: 'GET',
        user: { id: user.id, tier: 'pro' },
      } as AuthenticatedRequest;
      const res = {
        writeHead: (s: number) => { status = s; },
        end: (data: string) => { responseData = data; },
      } as any;

      const handled = await handleTradingViewRoutes(req, res, '/api/tv/my-webhook', userStore);
      expect(handled).toBe(true);
      expect(status).toBe(200);
      const parsed = JSON.parse(responseData);
      expect(parsed.webhookUrl).toBeTruthy();
      expect(parsed.webhookUrl).toContain(user.id);
      expect(parsed.instructions).toBeTruthy();
      expect(parsed.instructions.step1).toBeTruthy();
      expect(parsed.instructions.step2).toBeTruthy();
      expect(parsed.instructions.step3).toBeTruthy();
      expect(parsed.instructions.step4).toBeTruthy();
    });

    it('should include setup instructions in response', async () => {
      const user = userStore.createUser('test@example.com', 'pro');

      let responseData = '';
      const req = {
        method: 'GET',
        user: { id: user.id, tier: 'pro' },
      } as AuthenticatedRequest;
      const res = {
        writeHead: () => {},
        end: (data: string) => { responseData = data; },
      } as any;

      await handleTradingViewRoutes(req, res, '/api/tv/my-webhook', userStore);
      const parsed = JSON.parse(responseData);
      const instructions = parsed.instructions;
      expect(instructions.step1).toContain('TradingView');
      expect(instructions.step2).toContain('Webhook URL');
      expect(instructions.step3).toContain('X-TV-Secret');
      expect(instructions.step4).toContain('JSON');
      expect(instructions.note).toContain('text format');
    });

    it('should reject non-GET method', async () => {
      const user = userStore.createUser('test@example.com', 'pro');

      let status = 0;
      const req = {
        method: 'POST',
        user: { id: user.id, tier: 'pro' },
      } as AuthenticatedRequest;
      const res = {
        writeHead: (s: number) => { status = s; },
        end: () => {},
      } as any;

      const handled = await handleTradingViewRoutes(req, res, '/api/tv/my-webhook', userStore);
      expect(handled).toBe(true);
      expect(status).toBe(405);
    });
  });

  describe('Unmatched routes', () => {
    it('should return false for unmatched path', async () => {
      const req = {
        method: 'GET',
        user: { id: 'user-1', tier: 'pro' },
      } as AuthenticatedRequest;
      const res = {
        writeHead: () => {},
        end: () => {},
      } as any;

      const handled = await handleTradingViewRoutes(req, res, '/api/unknown', userStore);
      expect(handled).toBe(false);
    });
  });
});
