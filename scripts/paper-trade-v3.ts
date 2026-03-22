/**
 * Paper Trading v3 — Lower edge threshold + news-enhanced LLM evaluation
 */

import { LlmRouter } from '../src/lib/llm-router.js';
import type { MarketOpportunity } from '../src/polymarket/market-scanner.js';

const GAMMA_URL = 'https://gamma-api.polymarket.com';

interface GammaMarket {
  id: string; question: string; conditionId: string;
  outcomePrices: string; volume: string; liquidity: string;
  active: boolean; closed: boolean;
  tokens: Array<{ token_id: string; outcome: string }>;
}

interface Signal {
  conditionId: string; question: string; side: 'YES' | 'NO';
  marketPrice: number; llmProb: number; edge: number;
  confidence: number; size: number; reasoning: string;
}

async function fetchMarkets(limit = 50, minVol = 1000): Promise<MarketOpportunity[]> {
  const res = await fetch(GAMMA_URL + '/markets?limit=' + limit + '&active=true&closed=false&order=volume&ascending=false', { signal: AbortSignal.timeout(10000) });
  const markets = (await res.json()) as GammaMarket[];
  const opps: MarketOpportunity[] = [];

  for (const m of markets) {
    const vol = parseFloat(m.volume || '0');
    if (vol < minVol || m.closed || !m.active) continue;
    let prices: number[];
    try { prices = JSON.parse(m.outcomePrices).map(Number); } catch { continue; }
    if (prices.length < 2 || prices[0] <= 0.02 || prices[0] >= 0.98) continue;

    opps.push({
      conditionId: m.conditionId || m.id,
      description: m.question || '',
      yesTokenId: m.tokens?.[0]?.token_id || '',
      noTokenId: m.tokens?.[1]?.token_id || '',
      yesMidPrice: prices[0], noMidPrice: prices[1],
      priceSum: prices[0] + prices[1],
      priceSumDelta: prices[0] + prices[1] - 1,
      yesSpread: 0, noSpread: 0, volume: vol, score: 0,
    });
  }
  return opps.sort((a, b) => b.volume - a.volume);
}

async function llmEvaluate(
  router: LlmRouter, question: string, yesPrice: number
): Promise<{ prob: number; conf: number; reasoning: string }> {
  const response = await router.chat({
    messages: [
      {
        role: 'system',
        content: 'You analyze prediction markets. Given a question and YES price, estimate true probability. Reply JSON only: {"probability": 0.XX, "confidence": 0.XX, "reasoning": "brief"}',
      },
      {
        role: 'user',
        content: 'Market: "' + question + '"\nYES price: ' + yesPrice.toFixed(3) + '\nDate: 2026-03-23\nEstimate:',
      },
    ],
    maxTokens: 100,
    temperature: 0.1,
  });

  try {
    let raw = response.content;
    // Strip markdown code fences if present
    if (raw.includes('```')) {
      const lines = raw.split('\n').filter((l: string) => !l.startsWith('```'));
      raw = lines.join('\n');
    }
    raw = raw.trim();
    // Extract JSON object
    const si = raw.indexOf('{');
    const ei = raw.lastIndexOf('}');
    if (si >= 0 && ei > si) raw = raw.slice(si, ei + 1);
    const d = JSON.parse(raw);
    return {
      prob: Math.max(0, Math.min(1, d.probability || 0.5)),
      conf: Math.max(0, Math.min(1, d.confidence || 0.5)),
      reasoning: d.reasoning || '',
    };
  } catch {
    return { prob: 0.5, conf: 0, reasoning: 'parse_error' };
  }
}

function kellySize(edge: number, conf: number, capital: number, fraction = 0.25): number {
  const adj = edge * conf;
  const kelly = Math.max(0, (adj * 2 - (1 - adj)) / 1);
  return Math.min(kelly * fraction * capital, capital * 0.05);
}

async function main() {
  const CAPITAL = 50000;
  const MIN_EDGE = 0.02;
  const MIN_CONF = 0.55;

  console.log('=== PAPER TRADING v3 ===');
  console.log('Capital: $' + CAPITAL + ' | Min edge: ' + MIN_EDGE + ' | Min conf: ' + MIN_CONF);
  console.log('Time: ' + new Date().toISOString() + '\n');

  const markets = await fetchMarkets(100, 1000);
  const interesting = markets.filter((m) => m.yesMidPrice > 0.1 && m.yesMidPrice < 0.9 && m.volume > 5000);
  console.log('Total: ' + markets.length + ' | Interesting: ' + interesting.length + '\n');

  const router = new LlmRouter();
  const signals: Signal[] = [];
  const evalCount = Math.min(interesting.length, 15);

  for (let i = 0; i < evalCount; i++) {
    const m = interesting[i];
    const q = m.description.slice(0, 55);
    process.stdout.write('[' + (i + 1) + '/' + evalCount + '] ' + q + '... ');

    const est = await llmEvaluate(router, m.description, m.yesMidPrice);
    if (est.conf < MIN_CONF) {
      console.log('skip (conf=' + est.conf.toFixed(2) + ')');
      continue;
    }

    const yesEdge = est.prob - m.yesMidPrice;
    const noEdge = 1 - est.prob - m.noMidPrice;

    let side: 'YES' | 'NO';
    let edge: number;
    let mp: number;
    if (yesEdge > noEdge && yesEdge >= MIN_EDGE) {
      side = 'YES'; edge = yesEdge; mp = m.yesMidPrice;
    } else if (noEdge >= MIN_EDGE) {
      side = 'NO'; edge = noEdge; mp = m.noMidPrice;
    } else {
      console.log('no edge (y=' + yesEdge.toFixed(3) + ' n=' + noEdge.toFixed(3) + ')');
      continue;
    }

    const size = kellySize(edge, est.conf, CAPITAL);
    signals.push({
      conditionId: m.conditionId, question: m.description,
      side, marketPrice: mp, llmProb: est.prob,
      edge, confidence: est.conf, size, reasoning: est.reasoning,
    });
    console.log(side + ' edge=' + edge.toFixed(3) + ' conf=' + est.conf.toFixed(2) + ' $' + size.toFixed(0) + ' | ' + est.reasoning.slice(0, 40));
  }

  console.log('\n=== RESULTS ===');
  console.log('Evaluated: ' + evalCount + ' | Signals: ' + signals.length);
  if (signals.length > 0) {
    const total = signals.reduce((s, x) => s + x.size, 0);
    const avgEdge = signals.reduce((s, x) => s + x.edge, 0) / signals.length;
    console.log('Total position: $' + total.toFixed(0) + ' / $' + CAPITAL);
    console.log('Avg edge: ' + avgEdge.toFixed(3));
    console.log('\nSignals:');
    for (const s of signals) {
      console.log('  ' + s.side.padEnd(3) + ' $' + s.size.toFixed(0).padStart(5) + ' edge=' + s.edge.toFixed(3) + ' ' + s.question.slice(0, 45));
    }
  }
  console.log('\nCloud: ' + JSON.stringify(router.getCloudSpend()));
}

main().catch(console.error);
