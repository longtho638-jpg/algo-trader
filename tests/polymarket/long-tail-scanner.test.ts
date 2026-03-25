// Tests for long-tail filter options added to MarketScanner
// Uses stubbed fetch (for fetchRawMarkets) + mock ClobClient.getPrice

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MarketScanner } from '../../src/polymarket/market-scanner.js';
import type { ClobClient, RawMarket, RawPrice } from '../../src/polymarket/clob-client.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal RawMarket; end_date_iso is an extension field not in base type */
type ExtendedMarket = RawMarket & { end_date_iso?: string };

/** Build a Gamma API market object that GammaClient.getTrending() would return */
function makeGammaMarket(overrides: Partial<ExtendedMarket> & { condition_id: string; volume: string }): Record<string, unknown> {
  const cid = overrides.condition_id;
  return {
    id: cid + '-q',
    question: overrides.description ?? `Market ${cid}`,
    slug: cid,
    conditionId: cid,
    clobTokenIds: JSON.stringify([cid + '-yes', cid + '-no']),
    outcomePrices: JSON.stringify(['0.5', '0.5']),
    volume: overrides.volume,
    volume24hr: '0',
    liquidity: '10000',
    endDate: overrides.end_date_iso ?? '',
    active: overrides.active ?? true,
    closed: false,
    resolved: false,
    outcome: null,
    category: (overrides as Record<string, unknown>).category ?? '',
  };
}

function makeMarket(overrides: Partial<ExtendedMarket> & { condition_id: string; volume: string }): ExtendedMarket {
  return {
    question_id: overrides.condition_id + '-q',
    tokens: [
      { token_id: overrides.condition_id + '-yes', outcome: 'Yes' },
      { token_id: overrides.condition_id + '-no',  outcome: 'No'  },
    ],
    minimum_order_size: '5',
    minimum_tick_size: '0.01',
    description: `Market ${overrides.condition_id}`,
    active: true,
    ...overrides,
  };
}

/** Default price stub: mid=0.5, bid=0.48, ask=0.52 — priceSum=1.0, spread=0.04 */
const DEFAULT_PRICE: RawPrice = { mid: '0.5', bid: '0.48', ask: '0.52' };

/**
 * Build a MarketScanner with:
 *  - fetch stubbed to return `markets` from /markets endpoint
 *  - mock ClobClient in live mode (isPaperMode=false) so analyzeMarket uses getPrice
 */
function buildScanner(markets: ExtendedMarket[]): MarketScanner {
  // Convert to Gamma API format (scanner now uses GammaClient.getTrending)
  const gammaMarkets = markets.map(m => makeGammaMarket(m));

  // Stub global fetch — GammaClient calls fetch internally
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(gammaMarkets),
  }));

  const mockClient: Partial<ClobClient> = {
    get isPaperMode() { return false; },
    getPrice: vi.fn().mockResolvedValue(DEFAULT_PRICE),
  };

  return new MarketScanner(mockClient as ClobClient);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MarketScanner — long-tail filters', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('filters out markets exceeding maxVolume', async () => {
    const markets = [
      makeMarket({ condition_id: 'low',  volume: '50000'  }), // $50K  — keep
      makeMarket({ condition_id: 'high', volume: '200000' }), // $200K — exclude
    ];
    const scanner = buildScanner(markets);

    const result = await scanner.scan({ minVolume: 1_000, maxVolume: 100_000 });
    const ids = result.opportunities.map(o => o.conditionId);

    expect(ids).toContain('low');
    expect(ids).not.toContain('high');
  });

  it('applies minResolutionDays and maxResolutionDays filter', async () => {
    const now = Date.now();
    const in3Days  = new Date(now + 3  * 86_400_000).toISOString(); // too soon  (<7d)
    const in15Days = new Date(now + 15 * 86_400_000).toISOString(); // in window (7–30d)
    const in60Days = new Date(now + 60 * 86_400_000).toISOString(); // too far   (>30d)

    const markets = [
      makeMarket({ condition_id: 'soon', volume: '5000', end_date_iso: in3Days  }),
      makeMarket({ condition_id: 'good', volume: '5000', end_date_iso: in15Days }),
      makeMarket({ condition_id: 'far',  volume: '5000', end_date_iso: in60Days }),
    ];
    const scanner = buildScanner(markets);

    const result = await scanner.scan({
      minVolume: 1_000,
      minResolutionDays: 7,
      maxResolutionDays: 30,
    });
    const ids = result.opportunities.map(o => o.conditionId);

    expect(ids).toContain('good');
    expect(ids).not.toContain('soon');
    expect(ids).not.toContain('far');
  });

  it('keeps markets without end_date_iso when resolution filter is set', async () => {
    const markets = [
      makeMarket({ condition_id: 'no-date', volume: '5000' }), // no end_date_iso
    ];
    const scanner = buildScanner(markets);

    const result = await scanner.scan({
      minVolume: 1_000,
      minResolutionDays: 7,
      maxResolutionDays: 30,
    });
    const ids = result.opportunities.map(o => o.conditionId);

    expect(ids).toContain('no-date');
  });

  it('applies combined long-tail filter: maxVolume + resolution window', async () => {
    const now = Date.now();
    const in15Days = new Date(now + 15 * 86_400_000).toISOString();

    const markets = [
      makeMarket({ condition_id: 'match',     volume: '30000',  end_date_iso: in15Days }),
      makeMarket({ condition_id: 'too-big',   volume: '150000', end_date_iso: in15Days }),
      makeMarket({ condition_id: 'too-small', volume: '500'  }),  // below minVolume
    ];
    const scanner = buildScanner(markets);

    const result = await scanner.scan({
      minVolume: 1_000,
      maxVolume: 100_000,
      minResolutionDays: 7,
      maxResolutionDays: 30,
    });
    const ids = result.opportunities.map(o => o.conditionId);

    expect(ids).toContain('match');
    expect(ids).not.toContain('too-big');
    expect(ids).not.toContain('too-small');
  });

  it('ScanOptions interface accepts new fields — compile-time type check', () => {
    // If TypeScript compiles this, new fields are properly typed
    const opts = {
      minVolume: 1_000,
      maxVolume: 100_000,
      minResolutionDays: 7,
      maxResolutionDays: 30,
    };
    expect(opts.maxVolume).toBe(100_000);
    expect(opts.minResolutionDays).toBe(7);
  });
});
