// Resolution Tracker — checks Polymarket Gamma API for resolved markets
// Compares paper trade predictions against actual outcomes
// Calculates: accuracy, calibration error, Brier score, ROI simulation

import { logger } from '../core/logger.js';

export interface PaperTrade {
  id: number;
  timestamp: string;
  market_question: string;
  market_prob: number;
  our_prob: number;
  edge: number;
  direction: string;
  reasoning: string;
  strategy: string;
}

export interface ResolutionResult {
  trade: PaperTrade;
  resolved: boolean;
  outcome?: 'YES' | 'NO';
  correct?: boolean;
  brierScore?: number;
  /** Simulated P&L if we had bet $10 on this trade */
  simulatedPnl?: number;
}

export interface ResolutionSummary {
  totalTrades: number;
  resolved: number;
  unresolved: number;
  correct: number;
  incorrect: number;
  accuracy: number;
  avgBrierScore: number;
  totalSimulatedPnl: number;
  calibrationBuckets: CalibrationBucket[];
}

interface CalibrationBucket {
  range: string;
  predicted: number;
  actual: number;
  count: number;
}

interface GammaMarket {
  question?: string;
  slug?: string;
  closed?: boolean;
  resolved?: boolean;
  outcome?: string;
  outcomePrices?: string;
  volume?: string;
  endDate?: string;
}

const GAMMA_API = 'https://gamma-api.polymarket.com/markets';

/**
 * Fetch markets from Polymarket Gamma API by search query.
 */
export async function searchGammaMarkets(query: string): Promise<GammaMarket[]> {
  const url = `${GAMMA_API}?_q=${encodeURIComponent(query)}&limit=5`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    logger.warn(`Gamma API error: ${res.status}`, 'ResolutionTracker');
    return [];
  }
  return res.json() as Promise<GammaMarket[]>;
}

/**
 * Try to resolve a single paper trade against Gamma API.
 */
export async function checkResolution(trade: PaperTrade): Promise<ResolutionResult> {
  // Extract key terms from question for search
  const searchTerms = extractSearchTerms(trade.market_question);
  const markets = await searchGammaMarkets(searchTerms);

  // Find best match
  const match = findBestMatch(trade.market_question, markets);

  if (!match || !match.resolved) {
    return { trade, resolved: false };
  }

  const outcome = parseOutcome(match);
  if (!outcome) {
    return { trade, resolved: false };
  }

  const correct = evaluateCorrectness(trade, outcome);
  const brierScore = computeBrier(trade.our_prob, outcome);
  const simulatedPnl = computeSimulatedPnl(trade, outcome);

  return {
    trade,
    resolved: true,
    outcome,
    correct,
    brierScore,
    simulatedPnl,
  };
}

/**
 * Check all trades and produce summary statistics.
 */
export async function checkAllResolutions(
  trades: PaperTrade[],
  delayMs = 500,
): Promise<{ results: ResolutionResult[]; summary: ResolutionSummary }> {
  const results: ResolutionResult[] = [];

  for (const trade of trades) {
    const result = await checkResolution(trade);
    results.push(result);
    // Rate limit Gamma API calls
    if (delayMs > 0) await delay(delayMs);
  }

  const resolved = results.filter(r => r.resolved);
  const correct = resolved.filter(r => r.correct);
  const brierScores = resolved.map(r => r.brierScore ?? 1).filter(b => !isNaN(b));

  const summary: ResolutionSummary = {
    totalTrades: trades.length,
    resolved: resolved.length,
    unresolved: trades.length - resolved.length,
    correct: correct.length,
    incorrect: resolved.length - correct.length,
    accuracy: resolved.length > 0 ? correct.length / resolved.length : 0,
    avgBrierScore: brierScores.length > 0
      ? brierScores.reduce((a, b) => a + b, 0) / brierScores.length
      : 1,
    totalSimulatedPnl: resolved.reduce((s, r) => s + (r.simulatedPnl ?? 0), 0),
    calibrationBuckets: computeCalibration(resolved),
  };

  return { results, summary };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractSearchTerms(question: string): string {
  // Remove common filler words, keep key nouns
  return question
    .replace(/^Will\s+/i, '')
    .replace(/\?$/, '')
    .replace(/\b(the|a|an|in|on|at|by|for|of|to|be|is|are|was|were)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function findBestMatch(question: string, markets: GammaMarket[]): GammaMarket | null {
  if (markets.length === 0) return null;

  const qLower = question.toLowerCase();
  // Score each market by word overlap
  let best: GammaMarket | null = null;
  let bestScore = 0;

  for (const m of markets) {
    const mLower = (m.question ?? '').toLowerCase();
    const qWords = new Set(qLower.split(/\s+/));
    const mWords = mLower.split(/\s+/);
    const overlap = mWords.filter(w => qWords.has(w)).length;
    const score = overlap / Math.max(qWords.size, 1);
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }

  // Require at least 40% word overlap
  return bestScore >= 0.4 ? best : null;
}

function parseOutcome(market: GammaMarket): 'YES' | 'NO' | null {
  if (market.outcome === 'Yes' || market.outcome === 'YES') return 'YES';
  if (market.outcome === 'No' || market.outcome === 'NO') return 'NO';

  // Try outcomePrices: "[1, 0]" means YES won
  if (market.outcomePrices) {
    try {
      const prices = JSON.parse(market.outcomePrices) as number[];
      if (prices[0] === 1) return 'YES';
      if (prices[1] === 1) return 'NO';
    } catch { /* ignore parse errors */ }
  }

  return null;
}

function evaluateCorrectness(trade: PaperTrade, outcome: 'YES' | 'NO'): boolean {
  const dir = trade.direction.toUpperCase();
  if (dir.includes('YES') && outcome === 'YES') return true;
  if (dir.includes('NO') && outcome === 'NO') return true;
  return false;
}

function computeBrier(predictedProb: number, outcome: 'YES' | 'NO'): number {
  const actual = outcome === 'YES' ? 1 : 0;
  return (predictedProb - actual) ** 2;
}

function computeSimulatedPnl(trade: PaperTrade, outcome: 'YES' | 'NO'): number {
  // Simulate $10 bet
  const betSize = 10;
  const dir = trade.direction.toUpperCase();

  if (dir.includes('YES')) {
    // Bought YES at market_prob
    const cost = betSize * trade.market_prob;
    const payout = outcome === 'YES' ? betSize : 0;
    return payout - cost;
  } else if (dir.includes('NO')) {
    // Bought NO at (1 - market_prob)
    const cost = betSize * (1 - trade.market_prob);
    const payout = outcome === 'NO' ? betSize : 0;
    return payout - cost;
  }
  return 0;
}

function computeCalibration(resolved: ResolutionResult[]): CalibrationBucket[] {
  const buckets = [
    { range: '0-20%', min: 0, max: 0.2, predicted: 0, actual: 0, count: 0 },
    { range: '20-40%', min: 0.2, max: 0.4, predicted: 0, actual: 0, count: 0 },
    { range: '40-60%', min: 0.4, max: 0.6, predicted: 0, actual: 0, count: 0 },
    { range: '60-80%', min: 0.6, max: 0.8, predicted: 0, actual: 0, count: 0 },
    { range: '80-100%', min: 0.8, max: 1.01, predicted: 0, actual: 0, count: 0 },
  ];

  for (const r of resolved) {
    const prob = r.trade.our_prob;
    const actual = r.outcome === 'YES' ? 1 : 0;
    for (const b of buckets) {
      if (prob >= b.min && prob < b.max) {
        b.predicted += prob;
        b.actual += actual;
        b.count++;
        break;
      }
    }
  }

  return buckets.map(b => ({
    range: b.range,
    predicted: b.count > 0 ? b.predicted / b.count : 0,
    actual: b.count > 0 ? b.actual / b.count : 0,
    count: b.count,
  }));
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
