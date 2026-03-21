// Auto-tuning scheduled job: observe → analyze → tune → log
// Runs hourly via JobScheduler. Gracefully skips if AI gateway unavailable.
import { logger } from '../core/logger.js';
import { getWinTracker } from '../polymarket/win-tracker.js';
import { AlgorithmTuner } from './algorithm-tuner.js';
import { PerformanceAnalyzer } from './performance-analyzer.js';
import { TradeObserver } from './trade-observer.js';
import type { AiRouter } from './ai-router.js';
import type { DecisionLogger, AiDecision } from './decision-logger.js';
import type { PerformanceData } from './algorithm-tuner.js';

export interface AutoTuningConfig {
  /** Strategies to auto-tune */
  strategies: string[];
  /** Min trades before tuning kicks in */
  minTrades: number;
  /** Min confidence to log as "applied" */
  minConfidence: number;
}

const DEFAULT_CONFIG: AutoTuningConfig = {
  strategies: ['polymarket-arb', 'polymarket-cross-arb', 'polymarket-mm'],
  minTrades: 5,
  minConfidence: 0.6,
};

let _enabled = true;

export function setAutoTuningEnabled(enabled: boolean): void { _enabled = enabled; }
export function isAutoTuningEnabled(): boolean { return _enabled; }

/**
 * Create the auto-tuning handler for use with JobScheduler.
 * Dependencies injected at creation time.
 */
export function createAutoTuningHandler(
  aiRouter: AiRouter,
  observer: TradeObserver,
  decisionLogger: DecisionLogger,
  config: Partial<AutoTuningConfig> = {},
): () => Promise<void> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const tuner = new AlgorithmTuner(aiRouter);
  const analyzer = new PerformanceAnalyzer(aiRouter);

  return async function autoTuningTick(): Promise<void> {
    if (!_enabled) {
      logger.debug('Auto-tuning disabled, skipping', 'AutoTuning');
      return;
    }

    const snapshot = observer.getSnapshot();
    if (snapshot.recentTrades.length < cfg.minTrades) {
      logger.debug('Not enough trades for tuning', 'AutoTuning', {
        trades: snapshot.recentTrades.length,
        required: cfg.minTrades,
      });
      return;
    }

    // Analyze current performance via AI
    try {
      const analysis = await analyzer.analyzeSnapshot(snapshot);
      logger.info('Auto-tune analysis complete', 'AutoTuning', {
        assessment: analysis.assessment,
        confidence: analysis.confidence,
      });

      // Only tune if performance is warning or critical
      if (analysis.assessment === 'healthy' && analysis.confidence > 0.7) {
        logger.debug('Performance healthy, skipping tuning', 'AutoTuning');
        return;
      }
    } catch (err) {
      logger.warn('AI analysis failed, skipping tuning cycle', 'AutoTuning', {
        error: String(err),
      });
      return;
    }

    // Tune each strategy
    const winTracker = getWinTracker();
    for (const strategy of cfg.strategies) {
      try {
        const stats = winTracker.getWinRate(strategy);
        if (stats.totalTrades < cfg.minTrades) continue;

        const perfData: PerformanceData = {
          winRate: stats.rollingWinRate,
          sharpeRatio: 0, // placeholder — would need equity curve
          maxDrawdown: 0,
          totalTrades: stats.totalTrades,
          avgPnlPerTrade: '0',
          recentPnlTrend: stats.rollingWinRate > stats.winRate ? 'improving' : 'degrading',
        };

        const proposal = await tuner.proposeTuning(
          strategy as any,
          {}, // current params — would come from strategy config
          perfData,
        );

        const violations = tuner.validateProposal(proposal);
        const applied = violations.length === 0 && proposal.confidence >= cfg.minConfidence;

        // Log decision
        const decision: AiDecision = {
          id: `tune-${strategy}-${Date.now()}`,
          timestamp: Date.now(),
          type: 'tuning',
          input: `Strategy: ${strategy}, WinRate: ${stats.rollingWinRate.toFixed(3)}`,
          output: proposal.reasoning.slice(0, 200),
          model: 'complex',
          tokensUsed: 0,
          latencyMs: 0,
          applied,
          confidence: proposal.confidence,
        };
        decisionLogger.logDecision(decision);

        logger.info('Auto-tune proposal', 'AutoTuning', {
          strategy,
          confidence: proposal.confidence,
          applied,
          violations: violations.length,
        });
      } catch (err) {
        logger.warn('Auto-tune failed for strategy', 'AutoTuning', {
          strategy,
          error: String(err),
        });
      }
    }
  };
}
