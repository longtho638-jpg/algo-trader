// Event wiring layer — connects system events to their handlers
// Pure orchestration: no logic implemented here, only subscriptions registered
import type { EventBus } from '../events/event-bus.js';
import type { AuditLogger } from '../audit/audit-logger.js';
import type { PortfolioTracker } from '../portfolio/portfolio-tracker.js';
import type { NotificationRouter } from '../notifications/notification-router.js';
import type { UsageTracker } from '../metering/usage-tracker.js';

// ---------------------------------------------------------------------------
// Dependency types
// ---------------------------------------------------------------------------

export interface TradeEventDeps {
  audit: AuditLogger;
  portfolio: PortfolioTracker;
  notifications: NotificationRouter;
  metering: UsageTracker;
}

export interface StrategyEventDeps {
  audit: AuditLogger;
  notifications: NotificationRouter;
}

export interface SystemEventDeps {
  audit: AuditLogger;
  notifications: NotificationRouter;
}

// ---------------------------------------------------------------------------
// Trade events
// ---------------------------------------------------------------------------

/**
 * Wire 'trade.executed' and 'trade.failed' events.
 * On trade.executed: audit log + portfolio track + notification + metering.
 * On trade.failed: audit log only.
 */
export function wireTradeEvents(bus: EventBus, deps: TradeEventDeps): void {
  bus.on('trade.executed', ({ trade }) => {
    deps.audit.logEvent({
      category: 'trade',
      action: 'trade.executed',
      details: {
        orderId: trade.orderId,
        marketId: trade.marketId,
        side: trade.side,
        fillPrice: trade.fillPrice,
        fillSize: trade.fillSize,
        fees: trade.fees,
        strategy: trade.strategy,
        timestamp: trade.timestamp,
      },
    });

    deps.portfolio.addTrade(trade);

    // Fire-and-forget — router handles individual channel errors
    void deps.notifications.sendTradeAlert(trade);

    // Record metering for billing: attribute call to strategy as userId proxy
    deps.metering.recordCall(trade.strategy, 'trade.executed', 0);
  });

  bus.on('trade.failed', ({ error, request }) => {
    deps.audit.logEvent({
      category: 'trade',
      action: 'trade.failed',
      details: { error, request },
    });
  });
}

// ---------------------------------------------------------------------------
// Strategy lifecycle events
// ---------------------------------------------------------------------------

/**
 * Wire strategy.started / strategy.stopped / strategy.error.
 * Each event is audited and a notification is broadcast.
 */
export function wireStrategyEvents(bus: EventBus, deps: StrategyEventDeps): void {
  bus.on('strategy.started', ({ name, config }) => {
    deps.audit.logEvent({
      category: 'config',
      action: 'strategy.started',
      details: { name, config },
    });
    void deps.notifications.send(`Strategy started: ${name}`);
  });

  bus.on('strategy.stopped', ({ name, reason }) => {
    deps.audit.logEvent({
      category: 'config',
      action: 'strategy.stopped',
      details: { name, reason },
    });
    void deps.notifications.send(`Strategy stopped: ${name} — ${reason}`);
  });

  bus.on('strategy.error', ({ name, error }) => {
    deps.audit.logEvent({
      category: 'system',
      action: 'strategy.error',
      details: { name, error },
    });
    void deps.notifications.send(`Strategy error [${name}]: ${error}`);
  });
}

// ---------------------------------------------------------------------------
// System lifecycle events
// ---------------------------------------------------------------------------

/**
 * Wire system.startup and system.shutdown to audit + notifications.
 */
export function wireSystemEvents(bus: EventBus, deps: SystemEventDeps): void {
  bus.on('system.startup', ({ version, timestamp }) => {
    deps.audit.logEvent({
      category: 'system',
      action: 'system.startup',
      details: { version, timestamp },
    });
    void deps.notifications.send(`System started — v${version}`);
  });

  bus.on('system.shutdown', ({ reason }) => {
    deps.audit.logEvent({
      category: 'system',
      action: 'system.shutdown',
      details: { reason },
    });
    void deps.notifications.send(`System shutting down — ${reason}`);
  });
}
