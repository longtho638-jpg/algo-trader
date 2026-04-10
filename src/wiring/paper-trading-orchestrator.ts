/** Paper Trading Orchestrator — end-to-end pipeline glue.
 * market data → NATS → swarm consensus → AI validation → paper order → P&L → reflection
 * No real CLOB orders. Trades logged to data/paper-trades.json + NATS system.metrics. */

import * as fs from 'fs';
import * as path from 'path';
import { createMessageBus, getMessageBus } from '../messaging/create-message-bus';
import { Topics } from '../messaging/topic-schema';
import { startNatsEventLoop } from './nats-event-loop';
import { initVibeController, getVibeState } from './vibe-controller';
import { runSwarmConsensus } from '../intelligence/signal-consensus-swarm';
import { validateSignal } from '../intelligence/signal-validator';
import { reflectOnTrade } from '../intelligence/dual-level-reflection-engine';
import type { SignalCandidate } from '../intelligence/signal-validator';
import type { TradeOutcome } from '../intelligence/dual-level-reflection-engine';
import { logger } from '../utils/logger';

// ─── Types ───────────────────────────────────────────────────────────────────
export interface PaperTrade {
  id: string;
  marketId: string;
  side: 'YES' | 'NO';
  size: number; // USDC
  entryPrice: number;
  strategy: string;
  signalConfidence: number;
  swarmApproved: boolean;
  aiValidated: boolean;
  timestamp: number;
}

export interface PaperPortfolio {
  capital: number;
  positions: PaperTrade[];
  closedTrades: Array<PaperTrade & { exitPrice: number; pnl: number }>;
  totalPnl: number;
  winCount: number;
  lossCount: number;
}

// ─── Config & state ──────────────────────────────────────────────────────────
const TRADES_FILE = path.join(process.cwd(), 'data', 'paper-trades.json');
const POSITION_SIZE_PCT = 0.05;
const MIN_AI_CONFIDENCE = 0.7;

let portfolio: PaperPortfolio = { capital: 1000, positions: [], closedTrades: [], totalPnl: 0, winCount: 0, lossCount: 0 };

function saveTrades(): void {
  try {
    const dir = path.dirname(TRADES_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(TRADES_FILE, JSON.stringify(portfolio, null, 2));
  } catch (err) { logger.warn('[PaperOrchestrator] Persist failed', { err }); }
}

function loadTrades(): void {
  try {
    if (fs.existsSync(TRADES_FILE)) {
      portfolio = JSON.parse(fs.readFileSync(TRADES_FILE, 'utf-8')) as PaperPortfolio;
      logger.info('[PaperOrchestrator] Loaded portfolio', { positions: portfolio.positions.length, totalPnl: portfolio.totalPnl });
    }
  } catch { logger.info('[PaperOrchestrator] Fresh portfolio'); }
}

// ─── Signal processing ────────────────────────────────────────────────────────

async function processCandidate(candidate: SignalCandidate, maxPositions: number): Promise<void> {
  const vibe = getVibeState();
  if (portfolio.positions.length >= maxPositions || candidate.expectedEdge < vibe.minEdge / 100 || portfolio.capital <= 0) return;

  const swarm = await runSwarmConsensus(candidate);
  if (!swarm.approved) { logger.info('[PaperOrchestrator] Swarm REJECT', { type: candidate.signalType }); return; }

  const validation = await validateSignal(candidate);
  if (!validation.valid || validation.confidence < MIN_AI_CONFIDENCE) {
    logger.info('[PaperOrchestrator] AI REJECT', { type: candidate.signalType, conf: validation.confidence }); return;
  }

  const market = candidate.markets[0];
  if (!market) return;

  const size = Math.min(portfolio.capital * POSITION_SIZE_PCT, vibe.maxExposure);
  const trade: PaperTrade = {
    id: `paper-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    marketId: market.id, side: market.yesPrice < 0.5 ? 'YES' : 'NO', size,
    entryPrice: market.yesPrice, strategy: candidate.signalType,
    signalConfidence: validation.confidence, swarmApproved: true, aiValidated: true,
    timestamp: Date.now(),
  };

  portfolio.capital -= size;
  portfolio.positions.push(trade);
  saveTrades();
  logger.info('[PaperOrchestrator] Trade OPEN', { id: trade.id, side: trade.side, size, entryPrice: trade.entryPrice });
}

// ─── Position settlement ──────────────────────────────────────────────────────

async function checkPositions(): Promise<void> {
  const now = Date.now();
  const stale = portfolio.positions.filter(p => now - p.timestamp > 5 * 60_000);

  for (const trade of stale) {
    // Simulate price convergence: small random walk with slight positive bias
    const priceMove = (Math.random() - 0.48) * 0.04;
    const exitPrice = Math.max(0.01, Math.min(0.99, trade.entryPrice + priceMove));
    const pnl = trade.side === 'YES'
      ? (exitPrice - trade.entryPrice) * (trade.size / trade.entryPrice)
      : (trade.entryPrice - exitPrice) * (trade.size / (1 - trade.entryPrice));

    portfolio.positions = portfolio.positions.filter(p => p.id !== trade.id);
    portfolio.closedTrades.push({ ...trade, exitPrice, pnl });
    portfolio.capital += trade.size + pnl;
    portfolio.totalPnl += pnl;
    pnl >= 0 ? portfolio.winCount++ : portfolio.lossCount++;
    saveTrades();

    // Async reflection — non-blocking
    const outcome: TradeOutcome = {
      tradeId: trade.id, marketId: trade.marketId, strategy: trade.strategy,
      side: trade.side, entryPrice: trade.entryPrice, exitPrice, pnl,
      expectedEdge: trade.signalConfidence * 0.05, actualEdge: pnl / trade.size,
      executionLatency: 0, timestamp: trade.timestamp,
    };
    reflectOnTrade(outcome).catch(err => logger.warn('[PaperOrchestrator] Reflection error', { err }));

    logger.info('[PaperOrchestrator] Trade CLOSED', {
      id: trade.id, pnl: pnl.toFixed(4),
      totalPnl: portfolio.totalPnl.toFixed(4),
      winRate: (portfolio.winCount / Math.max(1, portfolio.winCount + portfolio.lossCount)).toFixed(2),
    });
  }
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

async function publishMetrics(): Promise<void> {
  try {
    const bus = getMessageBus();
    if (!bus.isConnected()) return;
    await bus.publish(Topics.SYSTEM_METRICS, {
      source: 'paper-trading-orchestrator',
      capital: portfolio.capital,
      openPositions: portfolio.positions.length,
      totalPnl: portfolio.totalPnl,
      winCount: portfolio.winCount,
      lossCount: portfolio.lossCount,
      timestamp: Date.now(),
    }, 'paper-trading-orchestrator');
  } catch { /* non-critical */ }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function startPaperTrading(config?: {
  capitalUsdc?: number;
  intervalMs?: number;
  maxPositions?: number;
}): Promise<void> {
  const intervalMs = config?.intervalMs ?? 30_000;
  const maxPositions = config?.maxPositions ?? 5;
  if (config?.capitalUsdc) portfolio.capital = config.capitalUsdc;

  logger.info('[PaperOrchestrator] Starting', { capital: portfolio.capital, intervalMs, maxPositions });

  loadTrades();
  await initVibeController();
  const loop = await startNatsEventLoop();
  const bus = await createMessageBus();

  // Consume validated signals from augmented pipeline
  type ValidatedEnvelope = { original: Record<string, unknown> };
  await bus.subscribe<ValidatedEnvelope>('signal.validated', async (envelope) => {
    const raw = envelope.data.original;
    const candidate: SignalCandidate = {
      signalType: (raw['signalType'] as SignalCandidate['signalType']) ?? 'simple-arb',
      markets: (raw['markets'] as SignalCandidate['markets']) ?? [],
      expectedEdge: (raw['expectedEdge'] as number) ?? 0,
      reasoning: (raw['reasoning'] as string) ?? '',
    };
    await processCandidate(candidate, maxPositions);
  });

  const ticker = setInterval(async () => {
    await checkPositions().catch(err => logger.error('[PaperOrchestrator] Check error', { err }));
    await publishMetrics();
  }, intervalMs);

  const shutdown = async () => {
    clearInterval(ticker);
    await loop.stop();
    saveTrades();
    logger.info('[PaperOrchestrator] Shutdown', { totalPnl: portfolio.totalPnl, closed: portfolio.closedTrades.length });
  };

  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);

  logger.info('[PaperOrchestrator] Active', { subscribing: 'signal.validated', intervalMs });
}
