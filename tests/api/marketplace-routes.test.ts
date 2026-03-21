import { describe, it, expect, beforeEach } from 'vitest';
import { handleMarketplaceRoutes } from '../../src/api/marketplace-routes.js';
import { MarketplaceService } from '../../src/marketplace/marketplace-service.js';
import { randomUUID } from 'node:crypto';

describe('Marketplace Routes', () => {
  let service: MarketplaceService;

  beforeEach(() => {
    // Use unique test DB per test to avoid DB isolation issues
    const testDb = `/tmp/test-marketplace-${randomUUID()}.db`;
    service = new MarketplaceService(testDb);
  });

  describe('GET /api/marketplace/browse', () => {
    it('should return browse results with pagination', async () => {
      let status = 0;
      let responseData = '';
      const req = {
        url: '/api/marketplace/browse?page=1&limit=20',
        method: 'GET',
      } as any;
      const res = {
        writeHead: (s: number) => { status = s; },
        end: (data: string) => { responseData = data; },
      } as any;

      const handled = await handleMarketplaceRoutes(req, res, 'user-1', 'free');
      expect(handled).toBe(true);
      expect(status).toBe(200);
      const parsed = JSON.parse(responseData);
      expect(parsed).toHaveProperty('page');
      expect(parsed).toHaveProperty('limit');
      expect(parsed).toHaveProperty('items');
    });

    it('should handle default pagination', async () => {
      let responseData = '';
      const req = {
        url: '/api/marketplace/browse',
        method: 'GET',
      } as any;
      const res = {
        writeHead: () => {},
        end: (data: string) => { responseData = data; },
      } as any;

      await handleMarketplaceRoutes(req, res, 'user-1', 'free');
      const parsed = JSON.parse(responseData);
      expect(parsed.page).toBe(1);
      expect(parsed.limit).toBe(20);
    });

    it('should filter by category when provided', async () => {
      // Publish a strategy
      service.publishStrategy('author-1', 'Test Poly', 'Polymarket strat', {}, 1000, 'polymarket');

      let responseData = '';
      const req = {
        url: '/api/marketplace/browse?category=polymarket',
        method: 'GET',
      } as any;
      const res = {
        writeHead: () => {},
        end: (data: string) => { responseData = data; },
      } as any;

      await handleMarketplaceRoutes(req, res, 'user-1', 'free');
      const parsed = JSON.parse(responseData);
      expect(parsed.items).toBeInstanceOf(Array);
    });

    it('should enforce limit max of 100', async () => {
      let responseData = '';
      const req = {
        url: '/api/marketplace/browse?limit=500',
        method: 'GET',
      } as any;
      const res = {
        writeHead: () => {},
        end: (data: string) => { responseData = data; },
      } as any;

      await handleMarketplaceRoutes(req, res, 'user-1', 'free');
      const parsed = JSON.parse(responseData);
      expect(parsed.limit).toBeLessThanOrEqual(100);
    });
  });

  describe('GET /api/marketplace/my-published', () => {
    it('should return empty list for user with no published strategies', async () => {
      const items = service.getMyPublished('user-with-nothing');
      expect(items).toEqual([]);
    });

    it('should return published strategies for user', async () => {
      const userId = 'author-1';
      service.publishStrategy(userId, 'Test Strategy', 'A test strategy', {}, 1000, 'crypto');
      service.publishStrategy(userId, 'Another Strategy', 'Another test', {}, 500, 'forex');

      const items = service.getMyPublished(userId);
      expect(items.length).toBeGreaterThanOrEqual(2);
      expect(items.map(i => i.name)).toContain('Test Strategy');
      expect(items.map(i => i.name)).toContain('Another Strategy');
    });
  });

  describe('GET /api/marketplace/my-purchased', () => {
    it('should return empty list for user with no purchases', async () => {
      const items = service.getMyPurchased('user-with-no-purchases');
      expect(items).toEqual([]);
    });

    it('should return purchased strategies for user', async () => {
      const authorId = 'author-unique-123';
      const buyerId = 'buyer-unique-456';
      const listing = service.publishStrategy(authorId, 'Test Strategy', 'A test strategy', {}, 1000, 'crypto');
      service.purchaseStrategy(buyerId, listing.id);

      const items = service.getMyPurchased(buyerId);
      expect(items.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('POST /api/marketplace/publish', () => {
    it('should return 403 for free tier user', async () => {
      let status = 0;
      const req = {
        url: '/api/marketplace/publish',
        method: 'POST',
        headers: {},
        on: (evt: string, cb: any) => {
          if (evt === 'data') {
            cb(Buffer.from(JSON.stringify({
              name: 'Test',
              description: 'Test strat',
              config: {},
              priceCents: 1000,
              category: 'crypto',
            })));
          }
          if (evt === 'end') cb();
        },
      } as any;
      const res = {
        writeHead: (s: number) => { status = s; },
        end: () => {},
      } as any;

      const handled = await handleMarketplaceRoutes(req, res, 'user-1', 'free');
      expect(handled).toBe(true);
      expect(status).toBe(403);
    });

    it('should publish strategy for pro tier user', async () => {
      let status = 0;
      let responseData = '';
      const req = {
        url: '/api/marketplace/publish',
        method: 'POST',
        headers: {},
        on: (evt: string, cb: any) => {
          if (evt === 'data') {
            cb(Buffer.from(JSON.stringify({
              name: 'Pro Strategy',
              description: 'A pro trading strategy',
              config: { leverage: 2 },
              priceCents: 5000,
              category: 'crypto',
            })));
          }
          if (evt === 'end') cb();
        },
      } as any;
      const res = {
        writeHead: (s: number) => { status = s; },
        end: (data: string) => { responseData = data; },
      } as any;

      const handled = await handleMarketplaceRoutes(req, res, 'pro-author-1', 'pro');
      expect(handled).toBe(true);
      expect(status).toBe(201);
      const parsed = JSON.parse(responseData);
      expect(parsed.listing).toBeTruthy();
      expect(parsed.listing.name).toBe('Pro Strategy');
      expect(parsed.listing.priceCents).toBe(5000);
    });

    it('should publish strategy for enterprise tier user', async () => {
      let status = 0;
      let responseData = '';
      const req = {
        url: '/api/marketplace/publish',
        method: 'POST',
        headers: {},
        on: (evt: string, cb: any) => {
          if (evt === 'data') {
            cb(Buffer.from(JSON.stringify({
              name: 'Enterprise Strategy',
              description: 'Advanced strategy',
              config: { complex: true },
              priceCents: 10000,
              category: 'polymarket',
            })));
          }
          if (evt === 'end') cb();
        },
      } as any;
      const res = {
        writeHead: (s: number) => { status = s; },
        end: (data: string) => { responseData = data; },
      } as any;

      const handled = await handleMarketplaceRoutes(req, res, 'ent-author-1', 'enterprise');
      expect(handled).toBe(true);
      expect(status).toBe(201);
      const parsed = JSON.parse(responseData);
      expect(parsed.listing).toBeTruthy();
    });

    it('should reject missing required fields', async () => {
      let status = 0;
      const req = {
        url: '/api/marketplace/publish',
        method: 'POST',
        headers: {},
        on: (evt: string, cb: any) => {
          if (evt === 'data') {
            cb(Buffer.from(JSON.stringify({
              name: 'Test',
              // missing description, config, priceCents, category
            })));
          }
          if (evt === 'end') cb();
        },
      } as any;
      const res = {
        writeHead: (s: number) => { status = s; },
        end: () => {},
      } as any;

      const handled = await handleMarketplaceRoutes(req, res, 'user-1', 'pro');
      expect(handled).toBe(true);
      expect(status).toBe(400);
    });

    it('should reject negative price', async () => {
      let status = 0;
      const req = {
        url: '/api/marketplace/publish',
        method: 'POST',
        headers: {},
        on: (evt: string, cb: any) => {
          if (evt === 'data') {
            cb(Buffer.from(JSON.stringify({
              name: 'Test',
              description: 'Test',
              config: {},
              priceCents: -100,
              category: 'crypto',
            })));
          }
          if (evt === 'end') cb();
        },
      } as any;
      const res = {
        writeHead: (s: number) => { status = s; },
        end: () => {},
      } as any;

      const handled = await handleMarketplaceRoutes(req, res, 'user-1', 'pro');
      expect(handled).toBe(true);
      expect(status).toBe(400);
    });
  });

  describe('GET /api/marketplace/strategy/:id', () => {
    it('should return strategy details', async () => {
      const listing = service.publishStrategy('author-unique-987', 'Test Strat', 'Test description', {}, 1000, 'crypto');
      const retrieved = service.getStrategy(listing.id);
      expect(retrieved).toBeTruthy();
      expect(retrieved?.name).toBe('Test Strat');
      expect(retrieved?.priceCents).toBe(1000);
    });

    it('should return undefined for non-existent strategy', async () => {
      const listing = service.getStrategy('nonexistent-id-xyz');
      expect(listing).toBeUndefined();
    });
  });

  describe('POST /api/marketplace/purchase/:id', () => {
    it('should purchase strategy for user', async () => {
      const listing = service.publishStrategy('author-purchase-test', 'Test Strat', 'Test description', {}, 1000, 'crypto');
      const { purchase, config } = service.purchaseStrategy('buyer-purchase-test', listing.id);
      expect(purchase).toBeTruthy();
      expect(config).toBeTruthy();
    });

    it('should throw error for non-existent strategy', async () => {
      expect(() => {
        service.purchaseStrategy('buyer-1', 'nonexistent-id-xyz');
      }).toThrow();
    });

    it('should throw error when already purchased', async () => {
      const listing = service.publishStrategy('author-dupe-test', 'Test Strat', 'Test description', {}, 1000, 'crypto');
      const buyerId = 'buyer-dupe-test';

      // First purchase
      service.purchaseStrategy(buyerId, listing.id);

      // Try to purchase again
      expect(() => {
        service.purchaseStrategy(buyerId, listing.id);
      }).toThrow('Already purchased');
    });
  });

  describe('Unmatched routes', () => {
    it('should return false for unmatched path', async () => {
      const req = {
        url: '/api/marketplace/unknown',
        method: 'GET',
      } as any;
      const res = {
        writeHead: () => {},
        end: () => {},
      } as any;

      const handled = await handleMarketplaceRoutes(req, res, 'user-1', 'free');
      expect(handled).toBe(false);
    });
  });
});
