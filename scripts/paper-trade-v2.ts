/**
 * Paper Trading v2 — Uses Gamma API for markets with real prices + volume
 * Filters: active, not closed, volume > K, has outcome prices
 */

import { LlmRouter } from '../src/lib/llm-router.js';
import { LlmSentimentStrategy } from '../src/strategies/polymarket/llm-sentiment-strategy.js';
import type { MarketOpportunity } from '../src/polymarket/market-scanner.js';

const GAMMA_URL = 'https://gamma-api.polymarket.com';

interface GammaMarket {
  id: string;
  question: string;
  conditionId: string;
  outcomePrices: string;
  volume: string;
  liquidity: string;
  active: boolean;
  closed: boolean;
  tokens: Array<{ token_id: string; outcome: string }>;
}

async function fetchActiveMarkets(limit = 20): Promise<MarketOpportunity[]> {
  const url = GAMMA_URL + '/markets?limit=' + limit + '&active=true&closed=false&order=volume&ascending=false';
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  const markets = await res.json() as GammaMarket[];
  const opps: MarketOpportunity[] = [];

  for (const m of markets) {
    const vol = parseFloat(m.volume || '0');
    if (vol < 5000 || m.closed || !m.active) continue;

    let prices: number[];
    try { prices = JSON.parse(m.outcomePrices); } catch { continue; }
    if (prices.length < 2) continue;

    const yesMid = Number(prices[0]);
    const noMid = Number(prices[1]);
    if (yesMid <= 0.01 || yesMid >= 0.99) continue; // skip near-resolved

    const tokens = m.tokens || [];
    opps.push({
      conditionId: m.conditionId || m.id,
      description: m.question || '',
      yesTokenId: tokens[0]?.token_id || '',
      noTokenId: tokens[1]?.token_id || '',
      yesMidPrice: yesMid,
      noMidPrice: noMid,
      priceSum: yesMid + noMid,
      priceSumDelta: yesMid + noMid - 1,
      yesSpread: 0,
      noSpread: 0,
      volume: vol,
      score: vol * Math.abs(yesMid + noMid - 1),
    });
  }

  return opps.sort((a, b) => b.volume - a.volume);
}

async function main() {
  console.log('=== PAPER TRADING v2 (Gamma API) ===');
  console.log('Time: ' + new Date().toISOString());

  const markets = await fetchActiveMarkets(50);
  console.log('Qualified markets: ' + markets.length + ' (vol>K, active, real prices)');

  if (markets.length === 0) { console.log('No markets. Exit.'); return; }

  const router = new LlmRouter();
  const strategy = new LlmSentimentStrategy(
    { minEdge: 0.05, minConfidence: 0.6, capitalUsdc: 50000, kellyFraction: 0.25 },
    router,
  );

  console.log('\n--- Evaluating top ' + Math.min(markets.length, 10) + ' markets ---');
  for (const m of markets.slice(0, 10)) {
    const q = m.description.slice(0, 55);
    console.log('\n[' + m.conditionId.slice(0, 8) + '] ' + q + '...');
    console.log('  YES=' + m.yesMidPrice.toFixed(3) + ' NO=' + m.noMidPrice.toFixed(3) + ' vol=$' + m.volume.toFixed(0));

    const signal = await strategy.evaluate(m);
    if (signal) {
      console.log('  >>> SIGNAL: ' + signal.side + ' edge=' + signal.edge.toFixed(3) +
        ' conf=' + signal.confidence.toFixed(2) + ' size=$' + signal.positionSize.toFixed(0));
    } else {
      console.log('  --- No signal');
    }
  }

  const signals = strategy.getSignals();
  console.log('\n=== RESULTS ===');
  console.log('Scanned: ' + markets.length);
  console.log('Evaluated: ' + Math.min(markets.length, 10));
  console.log('Signals: ' + signals.length);

  if (signals.length > 0) {
    const totalSize = signals.reduce((s, sig) => s + sig.positionSize, 0);
    const avgEdge = signals.reduce((s, sig) => s + sig.edge, 0) / signals.length;
    console.log('Total position: $' + totalSize.toFixed(0));
    console.log('Avg edge: ' + avgEdge.toFixed(3));
    console.log('Avg confidence: ' + (signals.reduce((s, sig) => s + sig.confidence, 0) / signals.length).toFixed(2));
    console.log('\nSignals:');
    for (const s of signals) {
      console.log('  ' + s.side + ' ' + s.question.slice(0, 40) + ' edge=' + s.edge.toFixed(3) + ' $' + s.positionSize.toFixed(0));
    }
  }

  console.log('\nCloud spend: ' + JSON.stringify(router.getCloudSpend()));
}

main().catch(console.error);
