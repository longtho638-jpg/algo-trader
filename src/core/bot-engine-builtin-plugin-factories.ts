/**
 * Built-in plugin factories for BotEngine plugin system.
 * Extracted from bot-engine-plugins to keep the PluginManager class file concise.
 * Factories: createAutonomyGatePlugin, createDailyLossPlugin,
 *            createSignalFilterPlugin, createWebhookPlugin.
 */

import { AgentEventType, AutonomyController } from '../a2ui';
import { WebhookNotifier } from './trading-event-webhook-notifier-with-hmac-retry';
import { logger } from '../utils/logger';
import { BotPlugin, PluginContext, PreTradeInfo } from './bot-engine-plugins';

/**
 * Autonomy Gate Plugin — vetoes trades when autonomy level is OBSERVE or PLAN.
 * Fixes the gap: AutonomyController.canExecute() was never called before trades.
 */
export function createAutonomyGatePlugin(autonomyController: AutonomyController): BotPlugin {
  return {
    name: 'autonomy-gate',
    version: '1.0.0',
    async onPreTrade(_ctx: PluginContext, trade: PreTradeInfo) {
      const canExecute = autonomyController.canExecute(trade.strategy);
      if (!canExecute) {
        const reason = `autonomy level for '${trade.strategy}' does not permit execution`;
        return { approved: false, reason };
      }
      return { approved: true };
    },
  };
}

/**
 * Daily Loss Limit Plugin — tracks realised P&L per day; vetoes once limit is breached.
 * Fixes: dailyLossLimitUsd was declared in config but never enforced.
 */
export function createDailyLossPlugin(limitUsd: number): BotPlugin {
  let dailyLoss = 0;
  let lastResetDay = new Date().toDateString();

  return {
    name: 'daily-loss-limit',
    version: '1.0.0',

    async onPreTrade(ctx: PluginContext, _trade: PreTradeInfo) {
      const today = new Date().toDateString();
      if (today !== lastResetDay) {
        dailyLoss = 0;
        lastResetDay = today;
        logger.info('[plugin:daily-loss-limit] Daily P&L counter reset');
      }

      if (dailyLoss <= -limitUsd) {
        ctx.eventBus.emit({
          type: AgentEventType.RISK_ALERT,
          tenantId: (ctx.config as Record<string, unknown>).tenantId as string || 'default',
          timestamp: Date.now(),
          alertType: 'daily_loss',
          value: Math.abs(dailyLoss),
          threshold: limitUsd,
          message: `Daily loss limit $${limitUsd} hit (realised: $${dailyLoss.toFixed(2)})`,
        });
        return {
          approved: false,
          reason: `daily loss limit $${limitUsd} exceeded (current: $${dailyLoss.toFixed(2)})`,
        };
      }
      return { approved: true };
    },

    async onPostTrade(_ctx: PluginContext, trade: { pnl?: number }) {
      if (trade.pnl !== undefined) {
        dailyLoss += trade.pnl;
        logger.info(
          `[plugin:daily-loss-limit] P&L update ${trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)} | daily: ${dailyLoss.toFixed(2)}`
        );
      }
    },
  };
}

/**
 * Signal Filter Plugin — vetoes trades whose composite score falls below minScore.
 * Fixes: SignalFilter was instantiated but its evaluate() result was never enforced.
 */
export function createSignalFilterPlugin(
  minScore: number,
  getSignalScore: (trade: PreTradeInfo) => number,
): BotPlugin {
  return {
    name: 'signal-filter',
    version: '1.0.0',

    async onPreTrade(_ctx: PluginContext, trade: PreTradeInfo) {
      const score = getSignalScore(trade);
      if (score < minScore) {
        return {
          approved: false,
          reason: `signal score ${score} below minimum ${minScore}`,
        };
      }
      logger.info(`[plugin:signal-filter] Score ${score} >= ${minScore} — approved`);
      return { approved: true };
    },
  };
}

/**
 * Webhook Plugin — fires trade.executed / bot.started / bot.stopped notifications.
 * Fixes: WebhookNotifier existed but was never wired to trade lifecycle.
 */
export function createWebhookPlugin(webhookUrl: string, secret?: string): BotPlugin {
  const notifier = new WebhookNotifier();
  notifier.register({
    url: webhookUrl,
    secret,
    events: ['trade.executed', 'bot.started', 'bot.stopped'],
  });

  return {
    name: 'webhook-notifier',
    version: '1.0.0',

    async onStart() {
      await notifier.notify('bot.started', { webhookUrl, timestamp: Date.now() });
    },

    async onPostTrade(_ctx: PluginContext, trade: { orderId: string; side: string; symbol: string; amount: number; price: number; fee: number; pnl?: number; success: boolean }) {
      await notifier.notify('trade.executed', {
        orderId: trade.orderId,
        side: trade.side,
        symbol: trade.symbol,
        amount: trade.amount,
        price: trade.price,
        fee: trade.fee,
        pnl: trade.pnl,
        success: trade.success,
      });
    },

    async onStop() {
      await notifier.notify('bot.stopped', { webhookUrl, timestamp: Date.now() });
    },
  };
}
