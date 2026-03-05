/**
 * BotEngine Plugin System — composable extensions for the trading bot.
 * Plugs standalone modules into BotEngine lifecycle via event hooks.
 * Inspired by n8n's node lifecycle + Portkey middleware.
 *
 * Wires these previously-disconnected modules:
 * - AutonomyController.canExecute() gates every trade
 * - dailyLossLimitUsd vetoes when breached
 * - SignalFilter scores veto below threshold
 * - Webhook notifications on trade events
 *
 * Built-in plugin factories are in bot-engine-builtin-plugin-factories.ts
 */

import { AgentEventBus, AgentEventType } from '../a2ui';
import { logger } from '../utils/logger';
import { ICandle } from '../interfaces/ICandle';
import { ISignal } from '../interfaces/IStrategy';

// --- Plugin Contracts ---

export interface PluginContext {
  eventBus: AgentEventBus;
  config: Record<string, unknown>;
}

export interface PreTradeInfo {
  side: 'buy' | 'sell';
  symbol: string;
  amount: number;
  price: number;
  strategy: string;
}

export interface PostTradeInfo extends PreTradeInfo {
  orderId: string;
  fee: number;
  pnl?: number;
  success: boolean;
}

export interface TradeDecision {
  approved: boolean;
  reason?: string;
}

export interface BotPlugin {
  name: string;
  version: string;
  onStart?(ctx: PluginContext): Promise<void>;
  /** Return { approved: false } to veto the trade */
  onPreTrade?(ctx: PluginContext, trade: PreTradeInfo): Promise<TradeDecision>;
  onPostTrade?(ctx: PluginContext, trade: PostTradeInfo): Promise<void>;
  onCandle?(ctx: PluginContext, candle: ICandle): Promise<void>;
  onTick?(ctx: PluginContext, tick: { price: number; timestamp: number }): Promise<void>;
  /** Allows plugins to enrich or veto a signal before it reaches the trade executor */
  onSignal?(ctx: PluginContext, signal: ISignal): Promise<ISignal | null>;
  onStop?(ctx: PluginContext): Promise<void>;
  onFinish?(ctx: PluginContext): Promise<void>;
}

// --- Plugin Manager ---

export class PluginManager {
  private plugins: BotPlugin[] = [];
  private ctx: PluginContext;

  constructor(eventBus: AgentEventBus, config?: Record<string, unknown>) {
    this.ctx = { eventBus, config: config ?? {} };
  }

  register(plugin: BotPlugin): void {
    this.plugins.push(plugin);
    logger.info(`[PluginManager] Registered plugin: ${plugin.name}@${plugin.version}`);
  }

  async onStart(): Promise<void> {
    for (const p of this.plugins) {
      if (p.onStart) {
        logger.info(`[plugin:${p.name}] onStart`);
        await p.onStart(this.ctx);
      }
    }
  }

  /** Run all plugins; first veto wins — trade is blocked. */
  async onPreTrade(trade: PreTradeInfo): Promise<TradeDecision> {
    for (const p of this.plugins) {
      if (!p.onPreTrade) continue;
      const decision = await p.onPreTrade(this.ctx, trade);
      if (!decision.approved) {
        logger.warn(
          `[plugin:${p.name}] Trade VETOED — ${decision.reason ?? 'no reason'} ` +
          `(${trade.side} ${trade.amount} ${trade.symbol} @ ${trade.price})`
        );
        return decision;
      }
    }
    return { approved: true };
  }

  async onPostTrade(trade: PostTradeInfo): Promise<void> {
    for (const p of this.plugins) {
      if (p.onPostTrade) {
        await p.onPostTrade(this.ctx, trade);
      }
    }
  }

  async onCandle(candle: ICandle): Promise<void> {
    for (const p of this.plugins) {
      if (p.onCandle) {
        await p.onCandle(this.ctx, candle);
      }
    }
  }

  async onTick(tick: { price: number; timestamp: number }): Promise<void> {
    for (const p of this.plugins) {
      if (p.onTick) {
        await p.onTick(this.ctx, tick);
      }
    }
  }

  async onSignal(signal: ISignal): Promise<ISignal | null> {
    let currentSignal: ISignal = signal;
    for (const p of this.plugins) {
      if (p.onSignal) {
        const result = await p.onSignal(this.ctx, currentSignal);
        if (result === null) {
          logger.warn(`[plugin:${p.name}] Signal suppressed by plugin`);
          return null;
        }
        currentSignal = result;
      }
    }
    return currentSignal;
  }

  async onStop(): Promise<void> {
    for (const p of this.plugins) {
      if (p.onStop) {
        logger.info(`[plugin:${p.name}] onStop`);
        await p.onStop(this.ctx);
      }
    }
  }

  async onFinish(): Promise<void> {
    for (const p of this.plugins) {
      if (p.onFinish) {
        logger.info(`[plugin:${p.name}] onFinish`);
        await p.onFinish(this.ctx);
      }
    }
  }

  getPlugins(): BotPlugin[] {
    return [...this.plugins];
  }
}

// Re-export built-in plugin factories for backward compatibility
export {
  createAutonomyGatePlugin,
  createDailyLossPlugin,
  createSignalFilterPlugin,
  createWebhookPlugin,
} from './bot-engine-builtin-plugin-factories';

// Re-export AgentEventType for consumers that imported it via this module
export { AgentEventType };
