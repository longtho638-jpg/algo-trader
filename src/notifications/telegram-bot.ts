// Telegram Bot API integration — native fetch, no external deps
// Handles sendMessage + delegates long-poll/command-dispatch to TelegramPoller
import type { TradeResult, PnlSnapshot } from '../core/types.js';
import { logger } from '../core/logger.js';
import { TelegramPoller } from './telegram-poller.js';

const TELEGRAM_API = 'https://api.telegram.org';

interface TelegramSendResponse {
  ok: boolean;
  description?: string;
}

type CommandHandler = (chatId: string, args: string[]) => Promise<void>;

// ── TelegramBot ────────────────────────────────────────────────────────────

export class TelegramBot {
  private readonly botToken: string;
  private readonly defaultChatId: string;
  private readonly poller: TelegramPoller;

  constructor(botToken: string, chatId: string) {
    this.botToken = botToken;
    this.defaultChatId = chatId;
    this.poller = new TelegramPoller(botToken);
    this.registerDefaultCommands();
  }

  // ── Messaging ────────────────────────────────────────────────────────────

  async sendMessage(
    chatId: string,
    text: string,
    parseMode: 'Markdown' | 'HTML' = 'Markdown',
  ): Promise<void> {
    const url = `${TELEGRAM_API}/bot${this.botToken}/sendMessage`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: parseMode }),
      });
      const data = (await res.json()) as TelegramSendResponse;
      if (!data.ok) {
        logger.warn('Telegram API error', 'TelegramBot', { description: data.description });
      }
    } catch (err) {
      // Non-critical — never crash the app
      logger.error('Telegram send failed', 'TelegramBot', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ── Commands ─────────────────────────────────────────────────────────────

  /** Register a slash-command handler, e.g. '/status' */
  registerCommand(command: string, handler: CommandHandler): void {
    this.poller.registerCommand(command, handler);
  }

  // ── Polling lifecycle ─────────────────────────────────────────────────────

  startPolling(): void {
    this.poller.start();
  }

  stopPolling(): void {
    this.poller.stop();
  }

  // ── Alert helpers (ChannelNotifier compat) ────────────────────────────────

  async sendTradeAlert(trade: TradeResult): Promise<void> {
    const side = trade.side === 'buy' ? '🟢 BUY' : '🔴 SELL';
    const text = [
      `*${side}* \`${trade.marketId}\` @ \`$${trade.fillPrice}\``,
      `Size: \`${trade.fillSize}\` | Fees: \`${trade.fees}\``,
      `Strategy: \`${trade.strategy}\``,
      `_${new Date(trade.timestamp).toISOString()}_`,
    ].join('\n');
    await this.sendMessage(this.defaultChatId, text);
  }

  async sendPnlReport(pnl: PnlSnapshot): Promise<void> {
    const drawdownPct = (pnl.drawdown * 100).toFixed(2);
    const winRate =
      pnl.tradeCount > 0
        ? ((pnl.winCount / pnl.tradeCount) * 100).toFixed(1)
        : '0.0';
    const text = [
      `*📊 P&L Report*`,
      `Equity: \`${pnl.equity}\` | Peak: \`${pnl.peakEquity}\``,
      `Drawdown: \`${drawdownPct}%\` | Realized: \`${pnl.realizedPnl}\``,
      `Trades: \`${pnl.tradeCount}\` | Win rate: \`${winRate}%\``,
      `_${new Date(pnl.timestamp).toISOString()}_`,
    ].join('\n');
    await this.sendMessage(this.defaultChatId, text);
  }

  async sendError(error: string): Promise<void> {
    const text = `*🚨 Error*\n\`${error}\`\n_${new Date().toISOString()}_`;
    await this.sendMessage(this.defaultChatId, text);
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private registerDefaultCommands(): void {
    this.poller.registerCommand('/help', async (chatId) => {
      const text = [
        '*Available commands:*',
        '`/status` — System status',
        '`/pnl` — Trade log summary',
        '`/positions` — Strategy status',
        '`/start` — Start trading engine',
        '`/stop` — Stop trading engine',
        '`/help` — This message',
      ].join('\n');
      await this.sendMessage(chatId, text);
    });
  }
}

// ── Factory ────────────────────────────────────────────────────────────────

/** Build TelegramBot from env vars. Returns null if not configured. */
export function createTelegramBot(): TelegramBot | null {
  const token = process.env['TELEGRAM_BOT_TOKEN'];
  const chatId = process.env['TELEGRAM_CHAT_ID'];
  const enabled = process.env['TELEGRAM_ENABLED'] !== 'false';

  if (!enabled || !token || !chatId) {
    logger.warn(
      'Telegram not configured — skipping (set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID)',
      'TelegramBot',
    );
    return null;
  }

  return new TelegramBot(token, chatId);
}

// Legacy alias — keeps any existing imports working
export { TelegramBot as TelegramNotifier };
