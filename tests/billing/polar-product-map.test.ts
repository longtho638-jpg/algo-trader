import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { productIdToTier, tierToProductId } from '../../src/billing/polar-product-map.js';

describe('productIdToTier', () => {
  const originalPro = process.env['POLAR_PRODUCT_PRO'];
  const originalEnt = process.env['POLAR_PRODUCT_ENTERPRISE'];

  beforeEach(() => {
    process.env['POLAR_PRODUCT_PRO'] = 'pro-id-123';
    process.env['POLAR_PRODUCT_ENTERPRISE'] = 'ent-id-456';
  });

  afterEach(() => {
    if (originalPro !== undefined) process.env['POLAR_PRODUCT_PRO'] = originalPro;
    else delete process.env['POLAR_PRODUCT_PRO'];
    if (originalEnt !== undefined) process.env['POLAR_PRODUCT_ENTERPRISE'] = originalEnt;
    else delete process.env['POLAR_PRODUCT_ENTERPRISE'];
  });

  it('should return pro for pro product id', () => {
    expect(productIdToTier('pro-id-123')).toBe('pro');
  });

  it('should return enterprise for enterprise product id', () => {
    expect(productIdToTier('ent-id-456')).toBe('enterprise');
  });

  it('should return free for unknown product id', () => {
    expect(productIdToTier('unknown-id')).toBe('free');
  });
});

describe('tierToProductId', () => {
  const originalPro = process.env['POLAR_PRODUCT_PRO'];
  const originalEnt = process.env['POLAR_PRODUCT_ENTERPRISE'];

  beforeEach(() => {
    process.env['POLAR_PRODUCT_PRO'] = 'pro-id-123';
    process.env['POLAR_PRODUCT_ENTERPRISE'] = 'ent-id-456';
  });

  afterEach(() => {
    if (originalPro !== undefined) process.env['POLAR_PRODUCT_PRO'] = originalPro;
    else delete process.env['POLAR_PRODUCT_PRO'];
    if (originalEnt !== undefined) process.env['POLAR_PRODUCT_ENTERPRISE'] = originalEnt;
    else delete process.env['POLAR_PRODUCT_ENTERPRISE'];
  });

  it('should return pro product id for pro tier', () => {
    expect(tierToProductId('pro')).toBe('pro-id-123');
  });

  it('should return enterprise product id for enterprise tier', () => {
    expect(tierToProductId('enterprise')).toBe('ent-id-456');
  });

  it('should return free product id for free tier', () => {
    const result = tierToProductId('free');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});
