// OpenClaw wiring — bootstraps AI controller, trade observer, and decision logger
// Connects to EventBus for real-time trade observation
import type { EventBus } from '../events/event-bus.js';
import { AiRouter } from '../openclaw/ai-router.js';
import { TradeObserver } from '../openclaw/trade-observer.js';
import { DecisionLogger } from '../openclaw/decision-logger.js';
import { loadOpenClawConfig } from '../openclaw/openclaw-config.js';
import { logger } from '../core/logger.js';
import type { OpenClawDeps } from '../openclaw/api-endpoints.js';
import { createAutoTuningHandler } from '../openclaw/auto-tuning-job.js';

export interface OpenClawBundle {
  router: AiRouter;
  observer: TradeObserver;
  decisionLogger: DecisionLogger;
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

  // Decision logger — audit trail for all AI decisions
  const decisionLogger = new DecisionLogger();

  // Build deps for API endpoint handlers
  const deps: OpenClawDeps = {
    controller: router,
    observer: { active: true, startedAt: Date.now() },
    tuner: router,
    history: [],
  };

  // Auto-tuning handler — register with scheduler
  const autoTuningHandler = createAutoTuningHandler(router, observer, decisionLogger);

  logger.info('OpenClaw AI subsystem wired', 'OpenClawWiring', {
    gateway: config.gatewayUrl,
    models: config.routing,
    authenticated: !!config.apiKey,
  });

  return { router, observer, decisionLogger, deps, autoTuningHandler };
}
