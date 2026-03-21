import { describe, it, expect, beforeEach } from 'vitest';
import { handleAdminRoutes } from '../../src/api/admin-routes.js';
import { UserStore } from '../../src/users/user-store.js';

const TEST_DB = '/tmp/test-admin-users.db';

describe('Admin Routes', () => {
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

    // Create test users
    userStore.createUser('admin@cashclaw.cc', 'enterprise');
    userStore.createUser('regular@example.com', 'pro');
    userStore.createUser('free@example.com', 'free');
  });

  describe('GET /api/admin/stats', () => {
    it('should return 403 for non-admin user', async () => {
      let status = 0;
      const req = { method: 'GET' } as any;
      const res = {
        writeHead: (s: number) => { status = s; },
        end: () => {},
      } as any;

      await handleAdminRoutes(req, res, 'regular-user-id', 'pro', userStore, '/api/admin/stats');
      expect(status).toBe(403);
    });

    it('should return stats for admin user', async () => {
      let status = 0;
      let responseData = '';
      const req = { method: 'GET' } as any;
      const res = {
        writeHead: (s: number) => { status = s; },
        end: (data: string) => { responseData = data; },
      } as any;

      const adminUser = userStore.listActiveUsers().find(u => u.email === 'admin@cashclaw.cc')!;
      await handleAdminRoutes(req, res, adminUser.id, 'enterprise', userStore, '/api/admin/stats');
      expect(status).toBe(200);
      const parsed = JSON.parse(responseData);
      expect(parsed).toHaveProperty('totalUsers');
      expect(parsed).toHaveProperty('mrr');
      expect(parsed).toHaveProperty('arpu');
      expect(parsed).toHaveProperty('tierDistribution');
      expect(parsed).toHaveProperty('newThisMonth');
      expect(parsed.totalUsers).toBeGreaterThan(0);
    });

    it('should reject non-GET method', async () => {
      let status = 0;
      const req = { method: 'POST' } as any;
      const res = {
        writeHead: (s: number) => { status = s; },
        end: () => {},
      } as any;

      const adminUser = userStore.listActiveUsers().find(u => u.email === 'admin@cashclaw.cc')!;
      await handleAdminRoutes(req, res, adminUser.id, 'enterprise', userStore, '/api/admin/stats');
      expect(status).toBe(405);
    });
  });

  describe('GET /api/admin/users', () => {
    it('should return 403 for non-admin user', async () => {
      let status = 0;
      const req = { method: 'GET' } as any;
      const res = {
        writeHead: (s: number) => { status = s; },
        end: () => {},
      } as any;

      await handleAdminRoutes(req, res, 'regular-user-id', 'pro', userStore, '/api/admin/users');
      expect(status).toBe(403);
    });

    it('should return list of users for admin', async () => {
      let status = 0;
      let responseData = '';
      const req = { method: 'GET' } as any;
      const res = {
        writeHead: (s: number) => { status = s; },
        end: (data: string) => { responseData = data; },
      } as any;

      const adminUser = userStore.listActiveUsers().find(u => u.email === 'admin@cashclaw.cc')!;
      await handleAdminRoutes(req, res, adminUser.id, 'enterprise', userStore, '/api/admin/users');
      expect(status).toBe(200);
      const parsed = JSON.parse(responseData);
      expect(parsed).toHaveProperty('users');
      expect(parsed).toHaveProperty('count');
      expect(parsed.users).toBeInstanceOf(Array);
      expect(parsed.users.length).toBeGreaterThan(0);
      expect(parsed.users[0]).toHaveProperty('id');
      expect(parsed.users[0]).toHaveProperty('email');
      expect(parsed.users[0]).toHaveProperty('tier');
    });

    it('should not expose sensitive user data', async () => {
      let responseData = '';
      const req = { method: 'GET' } as any;
      const res = {
        writeHead: () => {},
        end: (data: string) => { responseData = data; },
      } as any;

      const adminUser = userStore.listActiveUsers().find(u => u.email === 'admin@cashclaw.cc')!;
      await handleAdminRoutes(req, res, adminUser.id, 'enterprise', userStore, '/api/admin/users');
      const parsed = JSON.parse(responseData);
      const user = parsed.users[0];
      // Should not expose passwords or auth tokens
      expect(user).not.toHaveProperty('password');
      expect(user).not.toHaveProperty('token');
    });
  });

  describe('GET /api/admin/revenue', () => {
    it('should return 403 for non-admin user', async () => {
      let status = 0;
      const req = { method: 'GET' } as any;
      const res = {
        writeHead: (s: number) => { status = s; },
        end: () => {},
      } as any;

      await handleAdminRoutes(req, res, 'regular-user-id', 'pro', userStore, '/api/admin/revenue');
      expect(status).toBe(403);
    });

    it('should return revenue data for admin', async () => {
      let status = 0;
      let responseData = '';
      const req = { method: 'GET' } as any;
      const res = {
        writeHead: (s: number) => { status = s; },
        end: (data: string) => { responseData = data; },
      } as any;

      const adminUser = userStore.listActiveUsers().find(u => u.email === 'admin@cashclaw.cc')!;
      await handleAdminRoutes(req, res, adminUser.id, 'enterprise', userStore, '/api/admin/revenue');
      expect(status).toBe(200);
      const parsed = JSON.parse(responseData);
      expect(parsed).toHaveProperty('mrr');
      expect(parsed).toHaveProperty('timeline');
      expect(parsed).toHaveProperty('topTraders');
    });
  });

  describe('POST /api/admin/users/:id/tier', () => {
    it('should return 403 for non-admin user', async () => {
      let status = 0;
      const req = { method: 'POST', headers: {} } as any;
      const res = {
        writeHead: (s: number) => { status = s; },
        end: () => {},
      } as any;

      await handleAdminRoutes(req, res, 'regular-user-id', 'pro', userStore, '/api/admin/users/target-id/tier');
      expect(status).toBe(403);
    });

    it('should update user tier for admin', async () => {
      const targetUser = userStore.listActiveUsers().find(u => u.email === 'regular@example.com')!;

      let status = 0;
      let responseData = '';
      const req = {
        method: 'POST',
        headers: {},
        on: (evt: string, cb: any) => {
          if (evt === 'data') {
            cb(Buffer.from(JSON.stringify({ tier: 'enterprise' })));
          }
          if (evt === 'end') {
            cb();
          }
        },
      } as any;

      const res = {
        writeHead: (s: number) => { status = s; },
        end: (data: string) => { responseData = data; },
      } as any;

      const adminUser = userStore.listActiveUsers().find(u => u.email === 'admin@cashclaw.cc')!;
      await handleAdminRoutes(req, res, adminUser.id, 'enterprise', userStore, `/api/admin/users/${targetUser.id}/tier`);
      expect(status).toBe(200);
      const parsed = JSON.parse(responseData);
      expect(parsed.ok).toBe(true);
      expect(parsed.tier).toBe('enterprise');

      // Verify in DB
      const updated = userStore.getUserById(targetUser.id);
      expect(updated?.tier).toBe('enterprise');
    });

    it('should return 404 for non-existent user', async () => {
      let status = 0;
      let responseData = '';
      const req = {
        method: 'POST',
        headers: {},
        on: (evt: string, cb: any) => {
          if (evt === 'data') {
            cb(Buffer.from(JSON.stringify({ tier: 'pro' })));
          }
          if (evt === 'end') {
            cb();
          }
        },
      } as any;

      const res = {
        writeHead: (s: number) => { status = s; },
        end: (data: string) => { responseData = data; },
      } as any;

      const adminUser = userStore.listActiveUsers().find(u => u.email === 'admin@cashclaw.cc')!;
      await handleAdminRoutes(req, res, adminUser.id, 'enterprise', userStore, '/api/admin/users/nonexistent-id/tier');
      expect(status).toBe(404);
    });

    it('should reject invalid tier', async () => {
      const targetUser = userStore.listActiveUsers().find(u => u.email === 'regular@example.com')!;

      let status = 0;
      const req = {
        method: 'POST',
        headers: {},
        on: (evt: string, cb: any) => {
          if (evt === 'data') {
            cb(Buffer.from(JSON.stringify({ tier: 'invalid_tier' })));
          }
          if (evt === 'end') {
            cb();
          }
        },
      } as any;

      const res = {
        writeHead: (s: number) => { status = s; },
        end: () => {},
      } as any;

      const adminUser = userStore.listActiveUsers().find(u => u.email === 'admin@cashclaw.cc')!;
      await handleAdminRoutes(req, res, adminUser.id, 'enterprise', userStore, `/api/admin/users/${targetUser.id}/tier`);
      expect(status).toBe(400);
    });

    it('should reject non-POST method', async () => {
      const targetUser = userStore.listActiveUsers().find(u => u.email === 'regular@example.com')!;

      let status = 0;
      const req = { method: 'GET' } as any;
      const res = {
        writeHead: (s: number) => { status = s; },
        end: () => {},
      } as any;

      const adminUser = userStore.listActiveUsers().find(u => u.email === 'admin@cashclaw.cc')!;
      await handleAdminRoutes(req, res, adminUser.id, 'enterprise', userStore, `/api/admin/users/${targetUser.id}/tier`);
      expect(status).toBe(405);
    });
  });

  describe('Unmatched routes', () => {
    it('should return 404 for unknown admin path', async () => {
      let status = 0;
      const req = { method: 'GET' } as any;
      const res = {
        writeHead: (s: number) => { status = s; },
        end: () => {},
      } as any;

      const adminUser = userStore.listActiveUsers().find(u => u.email === 'admin@cashclaw.cc')!;
      await handleAdminRoutes(req, res, adminUser.id, 'enterprise', userStore, '/api/admin/unknown');
      expect(status).toBe(404);
    });
  });
});
