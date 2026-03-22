import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MarketplaceService } from '../../src/marketplace/marketplace-service.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let svc: MarketplaceService;
let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'mp-test-'));
  svc = new MarketplaceService(join(tmpDir, 'test.db'));
});

afterEach(() => {
  svc.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('MarketplaceService', () => {
  it('should publish a strategy', () => {
    const listing = svc.publishStrategy('author-1', 'Grid Bot', 'A grid strategy', { gridSpacing: 0.01 }, 2900, 'crypto');
    expect(listing.id).toBeDefined();
    expect(listing.name).toBe('Grid Bot');
    expect(listing.priceCents).toBe(2900);
    expect(listing.downloads).toBe(0);
  });

  it('should get strategy by id', () => {
    const published = svc.publishStrategy('a1', 'Test', 'desc', {}, 0, 'other');
    const found = svc.getStrategy(published.id);
    expect(found?.name).toBe('Test');
  });

  it('should return undefined for unknown id', () => {
    expect(svc.getStrategy('nonexistent')).toBeUndefined();
  });

  it('should browse active strategies', () => {
    svc.publishStrategy('a1', 'S1', 'd1', {}, 100, 'crypto');
    svc.publishStrategy('a1', 'S2', 'd2', {}, 200, 'polymarket');
    svc.publishStrategy('a2', 'S3', 'd3', {}, 300, 'crypto');
    const result = svc.browseStrategies(1, 10);
    expect(result.total).toBe(3);
    expect(result.items.length).toBe(3);
  });

  it('should filter browse by category', () => {
    svc.publishStrategy('a1', 'S1', 'd1', {}, 100, 'crypto');
    svc.publishStrategy('a1', 'S2', 'd2', {}, 200, 'polymarket');
    const result = svc.browseStrategies(1, 10, 'polymarket');
    expect(result.total).toBe(1);
    expect(result.items[0].name).toBe('S2');
  });

  it('should purchase strategy with 70/30 split', () => {
    const listing = svc.publishStrategy('a1', 'Premium', 'desc', { key: 'val' }, 1000, 'crypto');
    const { purchase, config } = svc.purchaseStrategy('buyer-1', listing.id);
    expect(purchase.pricePaid).toBe(1000);
    expect(purchase.creatorShare).toBe(700);
    expect(purchase.platformShare).toBe(300);
    expect(config).toEqual({ key: 'val' });
  });

  it('should throw on duplicate purchase', () => {
    const listing = svc.publishStrategy('a1', 'Strat', 'desc', {}, 500, 'crypto');
    svc.purchaseStrategy('buyer-1', listing.id);
    expect(() => svc.purchaseStrategy('buyer-1', listing.id)).toThrow('Already purchased');
  });

  it('should increment downloads on purchase', () => {
    const listing = svc.publishStrategy('a1', 'DL', 'desc', {}, 100, 'crypto');
    svc.purchaseStrategy('b1', listing.id);
    const updated = svc.getStrategy(listing.id)!;
    expect(updated.downloads).toBe(1);
  });

  it('should list author published strategies', () => {
    svc.publishStrategy('a1', 'S1', 'd1', {}, 0, 'crypto');
    svc.publishStrategy('a2', 'S2', 'd2', {}, 0, 'crypto');
    svc.publishStrategy('a1', 'S3', 'd3', {}, 0, 'other');
    const mine = svc.getMyPublished('a1');
    expect(mine.length).toBe(2);
  });

  it('should list buyer purchased strategies', () => {
    const l1 = svc.publishStrategy('a1', 'S1', 'd', {}, 100, 'crypto');
    const l2 = svc.publishStrategy('a1', 'S2', 'd', {}, 200, 'crypto');
    svc.purchaseStrategy('b1', l1.id);
    svc.purchaseStrategy('b1', l2.id);
    const purchased = svc.getMyPurchased('b1');
    expect(purchased.length).toBe(2);
  });

  it('should get top strategies by rating', () => {
    const l1 = svc.publishStrategy('a1', 'Low', 'd', {}, 0, 'crypto');
    const l2 = svc.publishStrategy('a1', 'High', 'd', {}, 0, 'crypto');
    svc.updateRating(l1.id, 30);
    svc.updateRating(l2.id, 90);
    const top = svc.getTopStrategies(1);
    expect(top[0].name).toBe('High');
  });

  it('should clamp rating between 0 and 100', () => {
    const l = svc.publishStrategy('a1', 'Clamp', 'd', {}, 0, 'crypto');
    svc.updateRating(l.id, 150);
    expect(svc.getStrategy(l.id)!.rating).toBe(100);
    svc.updateRating(l.id, -10);
    expect(svc.getStrategy(l.id)!.rating).toBe(0);
  });

  it('should submit and retrieve reviews', () => {
    const l = svc.publishStrategy('a1', 'Reviewed', 'd', {}, 0, 'crypto');
    const review = svc.submitReview('u1', l.id, 4, 'Great strategy!');
    expect(review.rating).toBe(4);
    const reviews = svc.getReviews(l.id);
    expect(reviews.length).toBe(1);
    expect(reviews[0].comment).toBe('Great strategy!');
  });

  it('should reject invalid review rating', () => {
    const l = svc.publishStrategy('a1', 'Bad', 'd', {}, 0, 'crypto');
    expect(() => svc.submitReview('u1', l.id, 0)).toThrow('Rating must be 1-5');
    expect(() => svc.submitReview('u1', l.id, 6)).toThrow('Rating must be 1-5');
  });

  it('should update listing rating from review average', () => {
    const l = svc.publishStrategy('a1', 'AvgRate', 'd', {}, 0, 'crypto');
    svc.submitReview('u1', l.id, 5);
    svc.submitReview('u2', l.id, 3);
    // Avg = 4, scaled to 0-100 = 4*20 = 80
    expect(svc.getStrategy(l.id)!.rating).toBe(80);
  });
});
