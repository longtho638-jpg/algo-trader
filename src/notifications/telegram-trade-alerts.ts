// Telegram trade alert subscriber — listens to event-bus and formats trade notifications
// Handles: trade.executed, strategy.started/stopped/error, pnl.snapshot, daily summary
import type { EventBus } from '../events/event-bus.js';
import type { TelegramBot } from './telegram-bot.js';
import { logger } from '../core/logger.js';

// ── Config ─────────────────────────────────────────────────────────────────

const DEFAULT_DAILY_SUMMARY_HOUR = 20; // 20:00 local time

// ── TelegramTradeAlerts ────────────────────────────────────────────────────

export class TelegramTradeAlerts {
  private readonly bot: TelegramBot;
  private readonly chatId: string;
  private readonly summaryHour: number;
  private summaryTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSummaryDate = '';

  constructor(
    bot: TelegramBot,
    chatId: string,
    summaryHour = DEFAULT_DAILY_SUMMARY_HOUR,
  ) {
    this.bot = bot;
    this.chatId = chatId;
    this.summaryHour = summaryHour;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  subscribe(eventBus: EventBus): void {
    eventBus.on('trade.executed', ({ trade }) => {
      void this.onTradeExecuted(trade.marketId, trade.side, trade.fillPrice, trade.fillSize, trade.strategy, trade.fees);
    });

    eventBus.on('trade.failed', ({ error }) => {
      void this.send(`*⚠️ Trade Failed*\n\`${error}\``);
    });

    eventBus.on('strategy.started', ({ name }) => {
      void this.send(`*▶️ Strategy Started*: \`${name}\``);
    });

    eventBus.on('strategy.stopped', ({ name, reason }) => {
      void this.send(`*⏹ Strategy Stopped*: \`${name}\`\nReason: ${reason}`);
    });

    eventBus.on('strategy.error', ({ name, error }) => {
      void this.send(`*🚨 Strategy Error*: \`${name}\`\n\`${error}\``);
    });

    eventBus.on('pnl.snapshot', ({ snapshot }) => {
      // Only send daily summary once per day at the configured hour
      const now = new Date();
      const dateKey = now.toISOString().slice(0, 10);
      if (now.getHours() === this.summaryHour && this.lastSummaryDate !== dateKey) {
        this.lastSummaryDate = dateKey;
        void this.sendDailySummary(snapshot);
      }
    });

    eventBus.on('alert.triggered', ({ rule, message }) => {
      void this.send(`*🔔 Alert* [\`${rule}\`]\n${message}`);
    });

    logger.info('Telegram trade alerts subscribed', 'TelegramTradeAlerts', {
      summaryHour: this.summaryHour,
    });
  }

  /** Schedule daily summary independently of pnl.snapshot events */
  scheduleDailySummary(getSummary: () => Promise<string>): void {
    const scheduleNext = () => {
      const now = new Date();
      const next = new Date(now);
      next.setHours(this.summaryHour, 0, 0, 0);
      if (next <= now) next.setDate(next.getDate() + 1);

      const delayMs = next.getTime() - now.getTime();
      logger.debug('Daily summary scheduled', 'TelegramTradeAlerts', {
        nextAt: next.toISOString(),
        delayMs,
      });

      this.summaryTimer = setTimeout(async () => {
        try {
          const text = await getSummary();
          await this.send(text);
        } catch (err) {
          logger.error('Daily summary send failed', 'TelegramTradeAlerts', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
        scheduleNext();
      }, delayMs);
    };

    scheduleNext();
  }

  stopScheduler(): void {
    if (this.summaryTimer) {
      clearTimeout(this.summaryTimer);
      this.summaryTimer = null;
    }
  }

  // ── Formatters ────────────────────────────────────────────────────────

  private async onTradeExecuted(
    marketId: string,
    side: string,
    fillPrice: string,
    fillSize: string,
    strategy: string,
    fees: string,
  ): Promise<void> {
    const sideLabel = side === 'buy' ? '🟢 BUY' : '🔴 SELL';
    const text = [
      `*${sideLabel}* \`${marketId}\` @ \`$${fillPrice}\``,
      `Size: \`${fillSize}\` | Fees: \`${fees}\``,
      `Strategy: \`${strategy}\``,
    ].join('\n');
    await this.send(text);
  }

  private async sendDailySummary(snapshot: {
    equity: string;
    realizedPnl: string;
    unrealizedPnl: string;
    tradeCount: number;
    winCount: number;
    drawdown: number;
  }): Promise<void> {
    const winRate = snapshot.tradeCount > 0
      ? ((snapshot.winCount / snapshot.tradeCount) * 100).toFixed(1)
      : '0.0';
    const drawdownPct = (snapshot.drawdown * 100).toFixed(2);
    const text = [
      `*📊 Daily Summary* — ${new Date().toISOString().slice(0, 10)}`,
      `Equity: \`${snapshot.equity}\``,
      `Realized P&L: \`${snapshot.realizedPnl}\` | Unrealized: \`${snapshot.unrealizedPnl}\``,
      `Trades: \`${snapshot.tradeCount}\` | Win rate: \`${winRate}%\` | Drawdown: \`${drawdownPct}%\``,
    ].join('\n');
    await this.send(text);
  }

  private async send(text: string): Promise<void> {
    await this.bot.sendMessage(this.chatId, text);
  }
}
