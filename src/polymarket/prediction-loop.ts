// Prediction Loop — orchestrates long-tail market scanning → LLM probability estimation → signal ranking
// Logs each prediction to SQLite (ai_decisions table). NO order execution — paper validation only.

import { MarketScanner, type ScanOptions, type MarketOpportunity } from './market-scanner.js';
import { PredictionProbabilityEstimator, type PredictionSignal } from '../openclaw/prediction-probability-estimator.js';
import { getDecisionLogger } from '../openclaw/decision-logger.js';
import { logger } from '../core/logger.js';

export interface PredictionLoopOptions {
  /** Scan options forwarded to MarketScanner (long-tail defaults applied) */
  scanOptions?: ScanOptions;
  /** Minimum |edge| to include signal in output (default: 0.05) */
  minEdge?: number;
  /** Max markets to estimate per cycle (guards against excessive LLM calls) */
  maxEstimates?: number;
  /** SQLite db path */
  dbPath?: string;
  /** Interval in milliseconds between loop cycles (default: 15 min) */
  intervalMs?: number;
}

export interface RankedSignal extends PredictionSignal {
  description: string;
  rank: number;
}

// Long-tail defaults: volume $1K–$100K, resolves in 7–30 days
const DEFAULT_SCAN_OPTIONS: ScanOptions = {
  minVolume: 1_000,
  maxVolume: 100_000,
  minResolutionDays: 7,
  maxResolutionDays: 30,
  limit: 50,
};

const DEFAULT_MIN_EDGE = 0.05;
const DEFAULT_MAX_ESTIMATES = 20;
const DEFAULT_INTERVAL_MS = 15 * 60 * 1_000; // 15 minutes

export class PredictionLoop {
  private readonly scanner: MarketScanner;
  private readonly estimator: PredictionProbabilityEstimator;
  private readonly opts: Required<Omit<PredictionLoopOptions, 'scanOptions'>> & { scanOptions: ScanOptions };
  private cycleCount = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(scanner: MarketScanner, estimator?: PredictionProbabilityEstimator, opts: PredictionLoopOptions = {}) {
    this.scanner = scanner;
    this.estimator = estimator ?? new PredictionProbabilityEstimator();
    this.opts = {
      scanOptions: { ...DEFAULT_SCAN_OPTIONS, ...opts.scanOptions },
      minEdge: opts.minEdge ?? DEFAULT_MIN_EDGE,
      maxEstimates: opts.maxEstimates ?? DEFAULT_MAX_ESTIMATES,
      dbPath: opts.dbPath ?? 'data/algo-trade.db',
      intervalMs: opts.intervalMs ?? DEFAULT_INTERVAL_MS,
    };
  }

  /**
   * Run a single prediction cycle.
   * Returns signals ranked by absolute edge (descending).
   */
  async runCycle(): Promise<RankedSignal[]> {
    this.cycleCount++;
    logger.info(`Prediction cycle #${this.cycleCount} started`, 'PredictionLoop');

    // Step 1: scan long-tail markets
    const result = await this.scanner.scan(this.opts.scanOptions);
    const markets = result.opportunities.slice(0, this.opts.maxEstimates);

    if (markets.length === 0) {
      logger.info('No long-tail markets found this cycle', 'PredictionLoop');
      return [];
    }

    logger.info(`Estimating probabilities for ${markets.length} markets`, 'PredictionLoop');

    // Step 2: estimate probability for each market (sequential to avoid hammering LLM)
    const signals: RankedSignal[] = [];
    for (const market of markets) {
      const signal = await this.estimateAndLog(market);
      if (signal && Math.abs(signal.edge) >= this.opts.minEdge && signal.direction !== 'skip') {
        signals.push({ ...signal, description: market.description, rank: 0 });
      }
    }

    // Step 3: rank by absolute edge descending
    signals.sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge));
    signals.forEach((s, i) => { s.rank = i + 1; });

    logger.info(`Cycle #${this.cycleCount} complete`, 'PredictionLoop', {
      scanned: markets.length,
      signals: signals.length,
    });

    return signals;
  }

  /**
   * Start the loop on a recurring interval.
   * Returns a stop function to halt the loop.
   */
  start(onCycle?: (signals: RankedSignal[]) => void): () => void {
    const tick = async () => {
      try {
        const signals = await this.runCycle();
        onCycle?.(signals);
      } catch (err) {
        logger.error('Prediction cycle error', 'PredictionLoop', { err: String(err) });
      }
      this.timer = setTimeout(tick, this.opts.intervalMs);
    };

    // Run immediately then schedule
    void tick();

    return () => {
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      logger.info('Prediction loop stopped', 'PredictionLoop');
    };
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  private async estimateAndLog(market: MarketOpportunity): Promise<PredictionSignal | null> {
    try {
      const signal = await this.estimator.estimate({
        marketId: market.conditionId,
        question: market.description,
        yesPrice: market.yesMidPrice,
      });

      // Persist to ai_decisions table
      const decisionLogger = getDecisionLogger(this.opts.dbPath);
      decisionLogger.logDecision({
        id: `pred_${market.conditionId}_${Date.now()}`,
        timestamp: Date.now(),
        type: 'analysis',
        input: `market:${market.conditionId} yesPrice:${market.yesMidPrice.toFixed(3)}`,
        output: `ourProb:${signal.ourProb.toFixed(3)} edge:${signal.edge.toFixed(3)} dir:${signal.direction}`,
        model: signal.model,
        tokensUsed: 0, // not tracked per-call in AiRouter response
        latencyMs: signal.latencyMs,
        applied: signal.direction !== 'skip',
        confidence: signal.confidence,
      });

      return signal;
    } catch (err) {
      logger.warn('Estimation failed', 'PredictionLoop', {
        conditionId: market.conditionId,
        err: String(err),
      });
      return null;
    }
  }
}
