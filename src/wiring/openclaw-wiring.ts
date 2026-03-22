// OpenClaw wiring — bootstraps AI controller, trade observer, tuning executor, and decision logger
// Connects to EventBus for real-time trade observation and AI-driven param hot-swap
import type { EventBus } from '../events/event-bus.js';
import { AiRouter } from '../openclaw/ai-router.js';
import { TradeObserver } from '../openclaw/trade-observer.js';
import { DecisionLogger } from '../openclaw/decision-logger.js';
import { AlgorithmTuner } from '../openclaw/algorithm-tuner.js';
import { TuningExecutor } from '../openclaw/tuning-executor.js';
import { TuningHistory } from '../openclaw/tuning-history.js';
import { AiSignalGenerator } from '../openclaw/ai-signal-generator.js';
import { loadOpenClawConfig } from '../openclaw/openclaw-config.js';
import { logger } from '../core/logger.js';
import type { OpenClawDeps } from '../openclaw/api-endpoints.js';
import { createAutoTuningHandler } from '../openclaw/auto-tuning-job.js';
import { selectStrategies } from '../openclaw/ai-strategy-selector.js';
import { adjustRisk } from '../openclaw/ai-risk-adjuster.js';
import { reviewTrade } from '../openclaw/ai-trade-reviewer.js';
import type { MarketConditions } from '../openclaw/ai-strategy-selector.js';
import type { RiskParams } from '../openclaw/ai-risk-adjuster.js';
import type { CompletedTrade } from '../openclaw/ai-trade-reviewer.js';

export interface OpenClawBundle {
  router: AiRouter;
  observer: TradeObserver;
  decisionLogger: DecisionLogger;
  tuningExecutor: TuningExecutor;
  tuningHistory: TuningHistory;
  signalGenerator: AiSignalGenerator;
  deps: OpenClawDeps;
  /** Auto-tuning handler for scheduler registration */
  autoTuningHandler: () => Promise<void>;
}

/**
 * Bootstrap OpenClaw AI subsystem.
 * Gracefully degrades if gateway is unreachable — observer still runs.
 */
export function wireOpenClaw(eventBus: EventBus): OpenClawBundle {
  const config = loadOpenClawConfig();

  // AI router — shared across controller/tuner/analyzer
  const router = new AiRouter(config);

  // Trade observer — uses startObserving(bus) to subscribe to events
  const observer = new TradeObserver();
  observer.startObserving(eventBus);

  // AI risk alert pipeline: after each trade, check for anomalies → emit alert
  let lastAlertAt = 0;
  const ALERT_COOLDOWN_MS = 5 * 60_000; // max 1 alert per 5 min
  eventBus.on('trade.executed', () => {
    const now = Date.now();
    if (now - lastAlertAt < ALERT_COOLDOWN_MS) return;
    const snapshot = observer.getSnapshot();
    if (observer.shouldAlert(snapshot)) {
      lastAlertAt = now;
      const reasons: string[] = [];
      if (snapshot.winRate < 0.4) reasons.push(`win rate ${(snapshot.winRate * 100).toFixed(1)}% < 40%`);
      if (snapshot.drawdown > 0.15) reasons.push(`drawdown ${(snapshot.drawdown * 100).toFixed(1)}% > 15%`);
      eventBus.emit('alert.triggered', {
        rule: 'openclaw-ai-risk',
        message: `[OpenClaw] Risk alert: ${reasons.join(', ')}. Active: ${snapshot.activeStrategies.join(', ') || 'none'}. Trades: ${snapshot.recentTrades.length}`,
      });
      logger.warn('OpenClaw risk alert triggered', 'OpenClawWiring', { reasons, trades: snapshot.recentTrades.length });
    }
  });

  // Decision logger — audit trail for all AI decisions
  const decisionLogger = new DecisionLogger();

  // Tuning subsystem — AI-driven param hot-swap with safety validation
  const tuner = new AlgorithmTuner(router);
  const tuningExecutor = new TuningExecutor(tuner);
  const tuningHistory = new TuningHistory();

  // AI Signal generator — generates trade signals from market analysis
  const signalGenerator = new AiSignalGenerator(router);

  // Build deps for API endpoint handlers
  const deps: OpenClawDeps = {
    controller: router,
    observer: { active: true, startedAt: Date.now() },
    tuner: router,
    history: [],
    tuningHistory: {
      getAll: () => tuningHistory.getHistory(),
      getEffectivenessReport: () => tuningHistory.getEffectiveness(),
    },
    tuningExecutor: {
      rollback: (strategy: string) => tuningExecutor.rollback(strategy as any),
    },
    signalGenerator,
  };

  // Auto-tuning handler — register with scheduler
  const autoTuningHandler = createAutoTuningHandler(router, observer, decisionLogger);

  logger.info('OpenClaw AI subsystem wired', 'OpenClawWiring', {
    gateway: config.gatewayUrl,
    models: config.routing,
    authenticated: !!config.apiKey,
  });

  return { router, observer, decisionLogger, tuningExecutor, tuningHistory, signalGenerator, deps, autoTuningHandler };
}

// ---------------------------------------------------------------------------
// AI Trading Loop Integration
// ---------------------------------------------------------------------------

/** Orchestrator interface for strategy selection hook */
export interface StrategyOrchestrator {
  onStrategySelect?: (
    conditions: MarketConditions,
    strategies: Parameters<typeof selectStrategies>[1],
  ) => ReturnType<typeof selectStrategies>;
}

/** Risk manager interface for risk evaluation hook */
export interface RiskManagerHook {
  onRiskAdjust?: (
    baseRisk: RiskParams,
    sentiment: string,
    recentPnl: number,
  ) => ReturnType<typeof adjustRisk>;
  onTradeComplete?: (trade: CompletedTrade) => ReturnType<typeof reviewTrade>;
}

/**
 * Wire OpenClaw AI modules (strategy selector, risk adjuster, trade reviewer)
 * into an existing orchestrator and risk manager.
 *
 * Opt-in via env var OPENCLAW_AI_TRADING=true — disabled by default to
 * avoid unintended AI calls in environments without a gateway.
 */
export function wireOpenClawAi(
  router: AiRouter,
  orchestrator: StrategyOrchestrator,
  riskManager: RiskManagerHook,
): void {
  if (process.env.OPENCLAW_AI_TRADING !== 'true') {
    logger.info('OpenClaw AI trading disabled (set OPENCLAW_AI_TRADING=true to enable)', 'OpenClawWiring');
    return;
  }

  // Hook: strategy selection phase
  orchestrator.onStrategySelect = (conditions, strategies) =>
    selectStrategies(conditions, strategies, router);

  // Hook: risk evaluation phase
  riskManager.onRiskAdjust = (baseRisk, sentiment, recentPnl) =>
    adjustRisk(baseRisk, sentiment, recentPnl, router);

  // Hook: post-trade review callback
  riskManager.onTradeComplete = (trade) =>
    reviewTrade(trade, router);

  logger.info('OpenClaw AI trading hooks wired', 'OpenClawWiring', {
    hooks: ['strategy-selector', 'risk-adjuster', 'trade-reviewer'],
  });
}
