#!/usr/bin/env node
// Admin CLI: Generate license key for algo-trade customers
// Usage: node scripts/generate-license.mjs --tier pro --user customer1 --days 30
// Requires: LICENSE_SECRET env var (HMAC-SHA256 signing key)

import { createHmac } from 'node:crypto';

const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : null;
}

const tier = getArg('tier') || 'pro';
const userId = getArg('user') || `user_${Date.now()}`;
const days = parseInt(getArg('days') || '30', 10);
const secret = process.env.LICENSE_SECRET;

if (!secret) {
  console.error('ERROR: Set LICENSE_SECRET env var first.');
  console.error('  export LICENSE_SECRET=$(openssl rand -hex 32)');
  process.exit(1);
}

const TIERS = {
  free:       { maxMarkets: 1,  maxTradesPerDay: 5,  features: [] },
  pro:        { maxMarkets: 10, maxTradesPerDay: -1, features: ['backtesting', 'multi-market'] },
  enterprise: { maxMarkets: -1, maxTradesPerDay: -1, features: ['backtesting', 'optimizer', 'webhook', 'multi-market'] },
};

if (!TIERS[tier]) {
  console.error(`ERROR: Invalid tier "${tier}". Use: free, pro, enterprise`);
  process.exit(1);
}

const now = Date.now();
const payload = {
  userId,
  tier,
  features: TIERS[tier].features,
  maxMarkets: TIERS[tier].maxMarkets,
  maxTradesPerDay: TIERS[tier].maxTradesPerDay,
  issuedAt: now,
  expiresAt: now + days * 24 * 60 * 60 * 1000,
};

function toBase64Url(input) {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const payloadPart = toBase64Url(JSON.stringify(payload));
const sig = createHmac('sha256', secret).update(payloadPart).digest();
const key = `${payloadPart}.${toBase64Url(sig)}`;

console.log('\n=== AlgoTrade License Key ===');
console.log(`User:    ${userId}`);
console.log(`Tier:    ${tier}`);
console.log(`Expires: ${new Date(payload.expiresAt).toISOString().slice(0, 10)} (${days} days)`);
console.log(`Markets: ${payload.maxMarkets === -1 ? 'unlimited' : payload.maxMarkets}`);
console.log(`Trades:  ${payload.maxTradesPerDay === -1 ? 'unlimited' : payload.maxTradesPerDay}/day`);
console.log(`\nLicense Key:\n${key}\n`);
