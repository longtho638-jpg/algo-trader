#!/usr/bin/env ts-node
/**
 * generate-license-key.ts
 * CLI tool to generate HMAC-signed license keys for algo-trader.
 *
 * Usage:
 *   ts-node scripts/generate-license-key.ts <tier> [days]
 *
 * Examples:
 *   ts-node scripts/generate-license-key.ts pro 365
 *   ts-node scripts/generate-license-key.ts enterprise 730
 *   ts-node scripts/generate-license-key.ts free
 *
 * Requires: RAAS_LICENSE_SECRET env var (min 32 chars)
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { generateLicenseKey, generateLicenseId, LicenseTierType } from '../src/lib/license-crypto';

const TIER_FEATURES: Record<LicenseTierType, string[]> = {
  free: ['basic_strategies', 'live_trading', 'basic_backtest'],
  pro: [
    'basic_strategies', 'live_trading', 'basic_backtest',
    'ml_models', 'premium_data', 'advanced_optimization',
  ],
  enterprise: [
    'basic_strategies', 'live_trading', 'basic_backtest',
    'ml_models', 'premium_data', 'advanced_optimization',
    'priority_support', 'custom_strategies', 'multi_exchange',
  ],
};

async function main(): Promise<void> {
  const [,, tierArg, daysArg] = process.argv;

  const validTiers: LicenseTierType[] = ['free', 'pro', 'enterprise'];
  const tier = (tierArg ?? '').toLowerCase() as LicenseTierType;

  if (!validTiers.includes(tier)) {
    console.error(`Usage: ts-node scripts/generate-license-key.ts <tier> [days]`);
    console.error(`  tier: free | pro | enterprise`);
    console.error(`  days: number of days until expiry (omit = no expiry)`);
    process.exit(1);
  }

  if (!process.env.RAAS_LICENSE_SECRET) {
    console.error('ERROR: RAAS_LICENSE_SECRET must be set in .env');
    process.exit(1);
  }

  if (process.env.RAAS_LICENSE_SECRET.length < 32) {
    console.error('ERROR: RAAS_LICENSE_SECRET must be at least 32 characters');
    process.exit(1);
  }

  const days = daysArg ? parseInt(daysArg, 10) : undefined;
  if (daysArg && (isNaN(days!) || days! <= 0)) {
    console.error('ERROR: days must be a positive integer');
    process.exit(1);
  }

  const licenseId = generateLicenseId();
  const features = TIER_FEATURES[tier];

  const key = await generateLicenseKey(
    {
      sub: licenseId,
      tier,
      features,
      iss: 'cashclaw',
    },
    process.env.RAAS_LICENSE_SECRET,
    days,
  );

  const expiresDisplay = days
    ? new Date(Date.now() + days * 86400 * 1000).toISOString().slice(0, 10)
    : 'never';

  console.log('');
  console.log('='.repeat(60));
  console.log(`  License Generated`);
  console.log('='.repeat(60));
  console.log(`  Tier     : ${tier.toUpperCase()}`);
  console.log(`  ID       : ${licenseId}`);
  console.log(`  Expires  : ${expiresDisplay}`);
  console.log(`  Features : ${features.join(', ')}`);
  console.log('='.repeat(60));
  console.log('');
  console.log('Add to .env:');
  console.log(`  RAAS_LICENSE_KEY=${key}`);
  console.log('');
}

main().catch((err: Error) => {
  console.error('Error generating license key:', err.message);
  process.exit(1);
});
