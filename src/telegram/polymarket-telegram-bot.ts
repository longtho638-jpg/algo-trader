/**
 * Polymarket Telegram Bot — Bridges TelegramCommandHandler + TelegramTradeAlertBot
 * with PolymarketBotEngine + PortfolioManager.
 *
 * Features:
 * - Real-time trade alerts when signals execute
 * - P&L reports from PortfolioManager
 * - Control commands: /pm_start, /pm_stop, /pm_status, /pm_pnl, /pm_positions
 * - Daily summary reports on schedule
 */

import { TelegramTradeAlertBot, TelegramBotConfig } from '../execution/telegram-trade-alert-bot';
import { TelegramCommandHandler, TelegramCommandConfig } from '../execution/telegram-command-handler';
import { PolymarketBotEngine, PolymarketBotConfig } from '../polymarket/bot-engine';
import { PortfolioManager } from '../core/PortfolioManager';
import { logger } from '../utils/logger';

export interface PolymarketTelegramConfig {
  botToken: string;
  chatId: string;
  pollingIntervalMs?: number;
  dailySummaryHour?: number;    // Hour (0-23) to send daily summary, default 20 (8PM)
  botConfig?: Partial<PolymarketBotConfig>;
}

export class PolymarketTelegramBot {
  private alertBot: TelegramTradeAlertBot;
  private commandHandler: TelegramCommandHandler;
  private botEngine: PolymarketBotEngine | null = null;
  private portfolio: PortfolioManager;
  private config: PolymarketTelegramConfig;
  private dailySummaryTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: PolymarketTelegramConfig) {
    this.config = config;
    this.portfolio = PortfolioManager.getInstance();

    const telegramConfig: TelegramBotConfig = {
      botToken: config.botToken,
      chatId: config.chatId,
      rateLimitMs: 1000,
    };

    const cmdConfig: TelegramCommandConfig = {
      botToken: config.botToken,
      chatId: config.chatId,
      pollingIntervalMs: config.pollingIntervalMs ?? 3000,
    };

    this.alertBot = new TelegramTradeAlertBot(telegramConfig);
    this.commandHandler = new TelegramCommandHandler(cmdConfig);

    this.registerPolymarketCommands();
  }

  /** Start both alert bot and command handler */
  async start(): Promise<void> {
    this.alertBot.start();
    this.commandHandler.start();

    this.startDailySummarySchedule();

    await this.commandHandler.reply(
      '🤖 *Polymarket Trading Bot Online*\nType /pm\\_help for commands.',
      'Markdown'
    );

    logger.info('[PolyTgBot] Started');
  }

  /** Stop everything cleanly */
  async stop(): Promise<void> {
    if (this.botEngine) {
      await this.botEngine.stop();
      this.botEngine = null;
    }

    this.alertBot.stop();
    this.commandHandler.stop();

    if (this.dailySummaryTimer) {
      clearInterval(this.dailySummaryTimer);
      this.dailySummaryTimer = null;
    }

    logger.info('[PolyTgBot] Stopped');
  }

  private registerPolymarketCommands(): void {
    this.commandHandler.registerCommand('/pm_help', async () => this.helpText());

    this.commandHandler.registerCommand('/pm_start', async (args) => this.handleStart(args));
    this.commandHandler.registerCommand('/pm_stop', async () => this.handleStop());
    this.commandHandler.registerCommand('/pm_status', async () => this.handleStatus());
    this.commandHandler.registerCommand('/pm_pnl', async () => this.handlePnl());
    this.commandHandler.registerCommand('/pm_positions', async () => this.handlePositions());
    this.commandHandler.registerCommand('/pm_summary', async () => this.handleDailySummary());
    this.commandHandler.registerCommand('/pm_set', async (args) => this.handleSet(args));
    this.commandHandler.registerCommand('/pm_config', async () => this.handleConfig());
  }

  private helpText(): string {
    return [
      '📊 *Polymarket Trading Bot*',
      '',
      '🎮 Control:',
      '  /pm\\_start [--live] — Start bot (dry-run default)',
      '  /pm\\_stop — Stop bot',
      '  /pm\\_status — Bot status & strategies',
      '',
      '💰 Portfolio:',
      '  /pm\\_pnl — Current P&L',
      '  /pm\\_positions — Open positions',
      '  /pm\\_summary — Daily summary report',
      '',
      '⚙️ Config:',
      '  /pm\\_set <param> <value> — Set param',
      '  /pm\\_config — View current config',
      '',
      '💡 Alerts auto-sent on trade execution.',
    ].join('\n');
  }

  private async handleStart(args: string): Promise<string> {
    if (this.botEngine) {
      return '⚠️ Bot already running. Use /pm\\_stop first.';
    }

    const isLive = args.includes('--live');
    const botConfig: Partial<PolymarketBotConfig> = {
      ...this.config.botConfig,
      dryRun: !isLive,
    };

    this.botEngine = new PolymarketBotEngine(botConfig);
    this.wireEngineEvents();

    try {
      await this.botEngine.start();
      const mode = isLive ? '⚠️ LIVE' : '🧪 DRY RUN';
      return `✅ *Bot Started* (${mode})\n9 strategies active.\nAlerts will appear here.`;
    } catch (err) {
      this.botEngine = null;
      const msg = err instanceof Error ? err.message : String(err);
      return `❌ Failed to start: ${msg}`;
    }
  }

  private async handleStop(): Promise<string> {
    if (!this.botEngine) {
      return '⚠️ Bot not running.';
    }

    await this.botEngine.stop();
    this.botEngine = null;
    return '🛑 Bot stopped. All orders cancelled.';
  }

  private handleStatus(): string {
    if (!this.botEngine) {
      return '💤 Bot not running. Use /pm\\_start to begin.';
    }

    const status = this.botEngine.getStatus();
    const lines = [
      `📊 *Bot Status*`,
      `Mode: ${status.mode}`,
      `Uptime: ${status.uptimeHuman}`,
      `Signals: ${status.totalSignals}`,
      `Trades: ${status.executedTrades}`,
      `Rejected: ${status.rejectedTrades}`,
      `P&L: $${status.dailyPnL.toFixed(2)}`,
      '',
      '*Strategies:*',
    ];

    for (const s of status.strategies) {
      const icon = s.enabled ? '✅' : '❌';
      lines.push(`  ${icon} ${s.name} (${s.signalCount} signals)`);
    }

    return lines.join('\n');
  }

  private handlePnl(): string {
    const summary = this.portfolio.getPortfolioSummary();
    const totalSign = summary.totalPnl >= 0 ? '+' : '';
    const realSign = summary.realizedPnl >= 0 ? '+' : '';
    const unrealSign = summary.unrealizedPnl >= 0 ? '+' : '';
    const emoji = summary.totalPnl >= 0 ? '📈' : '📉';

    return [
      `${emoji} *P&L Report*`,
      `Total: ${totalSign}$${summary.totalPnl.toFixed(2)}`,
      `Realized: ${realSign}$${summary.realizedPnl.toFixed(2)}`,
      `Unrealized: ${unrealSign}$${summary.unrealizedPnl.toFixed(2)}`,
      `Exposure: $${summary.totalExposure.toFixed(2)}`,
      `Positions: ${summary.totalPositions}`,
    ].join('\n');
  }

  private handlePositions(): string {
    const positions = this.portfolio.getOpenPositions();

    if (positions.length === 0) {
      return '📭 No open positions.';
    }

    const lines = [`📋 *Open Positions* (${positions.length})`];

    for (const p of positions.slice(0, 10)) {
      const pnlSign = p.unrealizedPnl >= 0 ? '+' : '';
      const emoji = p.unrealizedPnl >= 0 ? '🟢' : '🔴';
      lines.push(
        `${emoji} ${p.side} ${p.size}x @ $${p.avgPrice.toFixed(2)} → $${p.currentPrice.toFixed(2)} (${pnlSign}$${p.unrealizedPnl.toFixed(2)})`
      );
    }

    if (positions.length > 10) {
      lines.push(`... and ${positions.length - 10} more`);
    }

    return lines.join('\n');
  }

  private handleDailySummary(): string {
    const summary = this.portfolio.getPortfolioSummary();
    const openPositions = this.portfolio.getOpenPositions();
    const closedToday = this.portfolio.getPositions().filter(p => p.closedAt);
    const winCount = closedToday.filter(p => p.realizedPnl > 0).length;
    const winRate = closedToday.length > 0 ? winCount / closedToday.length : 0;

    const emoji = summary.totalPnl >= 0 ? '📈' : '📉';
    const sign = summary.totalPnl >= 0 ? '+' : '';

    return [
      `${emoji} *Daily Summary*`,
      `P&L: ${sign}$${summary.totalPnl.toFixed(2)}`,
      `Win Rate: ${(winRate * 100).toFixed(1)}%`,
      `Open: ${openPositions.length} | Closed: ${closedToday.length}`,
      `Exposure: $${summary.totalExposure.toFixed(2)}`,
      this.botEngine ? `Bot: ${this.botEngine.getStatus().mode}` : 'Bot: Stopped',
    ].join('\n');
  }

  /** Wire PolymarketBotEngine events to Telegram alerts */
  private wireEngineEvents(): void {
    if (!this.botEngine) return;

    this.botEngine.on('signal:executed', (data: { signal: any; dryRun: boolean }) => {
      const { signal } = data;
      this.alertBot.alertSignal(
        signal.strategy || 'Unknown',
        signal.action?.toLowerCase() || 'buy',
        signal.tokenId || 'unknown',
        signal.price || 0,
        1
      );
    });

    this.botEngine.on('trade:executed', (order: any) => {
      this.alertBot.sendRaw(
        `💰 *Trade Executed*\nOrder: \`${order.orderID || order.orderId || 'N/A'}\``
      );
    });

    this.botEngine.on('signal:rejected', (data: { signal: any; reason: string }) => {
      this.alertBot.alertAnomaly(
        'Signal Rejected',
        `Reason: ${data.reason}`
      );
    });

    this.botEngine.on('execution:error', (data: { signal: any; error: any }) => {
      const errMsg = data.error instanceof Error ? data.error.message : String(data.error);
      this.alertBot.alertAnomaly('Execution Error', errMsg);
    });
  }

  /** Schedule daily summary at configured hour */
  private startDailySummarySchedule(): void {
    const targetHour = this.config.dailySummaryHour ?? 20;

    // Check every 5 minutes if it's time for daily summary
    this.dailySummaryTimer = setInterval(() => {
      const now = new Date();
      if (now.getHours() === targetHour && now.getMinutes() < 5) {
        const summary = this.handleDailySummary();
        this.alertBot.sendRaw(summary);
      }
    }, 5 * 60 * 1000);

    this.dailySummaryTimer.unref();
  }

  /** Runtime parameter config: /pm_set spread 0.08 */
  private handleSet(args: string): string {
    const parts = args.trim().split(/\s+/);
    if (parts.length < 2) {
      return '⚠️ Usage: /pm\\_set <param> <value>\nParams: spread, size, edge, bankroll, dry\\_run';
    }
    const [param, value] = parts;
    const ALLOWED: Record<string, { envKey: string; parse: (v: string) => any }> = {
      spread: { envKey: 'MM_SPREAD', parse: parseFloat },
      size: { envKey: 'MM_SIZE', parse: parseFloat },
      edge: { envKey: 'MIN_ARB_EDGE', parse: parseFloat },
      bankroll: { envKey: 'MAX_BANKROLL', parse: parseFloat },
      dry_run: { envKey: 'DRY_RUN', parse: (v: string) => v === 'true' },
    };
    const cfg = ALLOWED[param];
    if (!cfg) return `❌ Unknown param: ${param}\nAllowed: ${Object.keys(ALLOWED).join(', ')}`;
    const parsed = cfg.parse(value);
    if (typeof parsed === 'number' && isNaN(parsed)) return `❌ Invalid number: ${value}`;
    process.env[cfg.envKey] = String(parsed);
    logger.info(`[PolyTgBot] Config updated: ${param} = ${parsed}`);
    return `✅ *${param}* set to \`${parsed}\`\n⚠️ Takes effect on next strategy tick.`;
  }

  /** Show current config: /pm_config */
  private handleConfig(): string {
    const env = process.env;
    return [
      '⚙️ *Current Config*',
      `spread: ${env.MM_SPREAD || '0.10'}`,
      `size: ${env.MM_SIZE || '50'}`,
      `edge: ${env.MIN_ARB_EDGE || '0.02'}`,
      `bankroll: ${env.MAX_BANKROLL || '5000'}`,
      `dry\\_run: ${env.DRY_RUN || 'true'}`,
      `scan\\_ms: ${env.SCAN_INTERVAL_MS || '60000'}`,
    ].join('\n');
  }
}
