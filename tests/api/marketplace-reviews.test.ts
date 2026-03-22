import { describe, it, expect, beforeEach } from 'vitest';
import { MarketplaceService } from '../../src/marketplace/marketplace-service.js';
import { randomUUID } from 'node:crypto';

describe('Marketplace Reviews', () => {
  let service: MarketplaceService;
  let strategyId: string;
  const authorId = 'author-review-test';

  beforeEach(() => {
    const testDb = `/tmp/test-reviews-${randomUUID()}.db`;
    service = new MarketplaceService(testDb);
    const listing = service.publishStrategy(authorId, 'Review Target', 'Test strategy', {}, 1000, 'crypto');
    strategyId = listing.id;
  });

  it('should submit a review with rating and comment', () => {
    const review = service.submitReview('user-1', strategyId, 4, 'Great strategy!');
    expect(review.rating).toBe(4);
    expect(review.comment).toBe('Great strategy!');
    expect(review.strategyId).toBe(strategyId);
    expect(review.userId).toBe('user-1');
    expect(review.id).toBeTruthy();
  });

  it('should update listing rating after review', () => {
    service.submitReview('user-1', strategyId, 5);
    const listing = service.getStrategy(strategyId);
    expect(listing!.rating).toBe(100); // 5 stars * 20 = 100
  });

  it('should calculate average rating from multiple reviews', () => {
    service.submitReview('user-1', strategyId, 5);
    service.submitReview('user-2', strategyId, 3);
    const listing = service.getStrategy(strategyId);
    // avg = (5+3)/2 = 4.0 → 4*20 = 80
    expect(listing!.rating).toBe(80);
  });

  it('should upsert review for same user+strategy', () => {
    service.submitReview('user-1', strategyId, 2, 'Meh');
    service.submitReview('user-1', strategyId, 5, 'Updated — actually great');
    const reviews = service.getReviews(strategyId);
    // Should have only 1 review (upserted)
    const userReviews = reviews.filter(r => r.userId === 'user-1');
    expect(userReviews.length).toBe(1);
  });

  it('should list reviews ordered by created_at desc', () => {
    service.submitReview('user-1', strategyId, 3);
    service.submitReview('user-2', strategyId, 5);
    const reviews = service.getReviews(strategyId);
    expect(reviews.length).toBe(2);
    expect(reviews[0].createdAt).toBeGreaterThanOrEqual(reviews[1].createdAt);
  });

  it('should throw for non-existent strategy', () => {
    expect(() => service.submitReview('user-1', 'nonexistent', 4)).toThrow('Strategy not found');
  });

  it('should throw for invalid rating', () => {
    expect(() => service.submitReview('user-1', strategyId, 0)).toThrow('Rating must be 1-5');
    expect(() => service.submitReview('user-1', strategyId, 6)).toThrow('Rating must be 1-5');
  });

  it('should return empty reviews for strategy with no reviews', () => {
    const reviews = service.getReviews(strategyId);
    expect(reviews).toEqual([]);
  });

  it('should default comment to empty string', () => {
    const review = service.submitReview('user-1', strategyId, 4);
    expect(review.comment).toBe('');
  });
});
