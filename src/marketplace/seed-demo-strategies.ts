// Seed demo strategies for marketplace showcase
// Provides realistic strategy listings for the marketplace demo
import type { MarketplaceService, MarketplaceCategory } from './marketplace-service.js';

interface DemoStrategy {
  name: string;
  description: string;
  category: MarketplaceCategory;
  priceCents: number;
  config: Record<string, unknown>;
}

const DEMO_STRATEGIES: DemoStrategy[] = [
  {
    name: 'Polymarket Arbitrage',
    description: 'Cross-market arbitrage exploiting price discrepancies between Polymarket and other prediction platforms.',
    category: 'polymarket',
    priceCents: 4900,
    config: { strategy: 'polymarket-arb', minSpread: 0.03, maxExposure: 5000 },
  },
  {
    name: 'Momentum Scalper Pro',
    description: 'High-frequency momentum strategy with adaptive entry/exit signals and Kelly-based position sizing.',
    category: 'polymarket',
    priceCents: 2900,
    config: { strategy: 'momentum-scalper', lookback: 14, kellyFraction: 0.25 },
  },
  {
    name: 'Market Maker Suite',
    description: 'Professional market-making strategy with dynamic spread adjustment and inventory management.',
    category: 'crypto',
    priceCents: 9900,
    config: { strategy: 'market-maker', spreadBps: 15, inventoryLimit: 10000 },
  },
  {
    name: 'Mean Reversion Alpha',
    description: 'Statistical mean-reversion strategy using Bollinger Bands and Z-score for entry timing.',
    category: 'crypto',
    priceCents: 3900,
    config: { strategy: 'mean-reversion', bbPeriod: 20, zThreshold: 2.0 },
  },
  {
    name: 'Trend Following MACD',
    description: 'Free trend-following strategy using MACD crossovers with multi-timeframe confirmation.',
    category: 'crypto',
    priceCents: 0,
    config: { strategy: 'trend-macd', fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
  },
  {
    name: 'Kalshi Event Trader',
    description: 'Event-driven strategy for Kalshi markets with sentiment analysis and probability modeling.',
    category: 'other',
    priceCents: 5900,
    config: { strategy: 'kalshi-event', sentimentWeight: 0.4, minEdge: 0.05 },
  },
];

const DEMO_AUTHOR_ID = 'demo-marketplace-author';

/**
 * Seed marketplace with demo strategies for showcase.
 * Idempotent — checks if strategies already exist by browsing.
 */
export function seedDemoStrategies(svc: MarketplaceService): number {
  const existing = svc.browseStrategies(1, 100);
  if (existing.total > 0) return 0;

  let seeded = 0;
  for (const demo of DEMO_STRATEGIES) {
    svc.publishStrategy(
      DEMO_AUTHOR_ID,
      demo.name,
      demo.description,
      demo.config,
      demo.priceCents,
      demo.category,
    );
    seeded++;
  }
  return seeded;
}
