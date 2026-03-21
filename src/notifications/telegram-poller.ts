// Telegram long-poll loop — separated from TelegramBot to keep files under 200 lines
import { logger } from '../core/logger.js';

const TELEGRAM_API = 'https://api.telegram.org';
const POLL_TIMEOUT_SEC = 30;

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number };
    text?: string;
  };
}

interface TelegramResponse<T = unknown> {
  ok: boolean;
  result?: T;
  description?: string;
}

type CommandHandler = (chatId: string, args: string[]) => Promise<void>;

/** Manages getUpdates long-poll loop and dispatches to registered command handlers */
export class TelegramPoller {
  private lastUpdateId = 0;
  private active = false;
  private readonly commands = new Map<string, CommandHandler>();
  private readonly botToken: string;

  constructor(botToken: string) {
    this.botToken = botToken;
  }

  registerCommand(command: string, handler: CommandHandler): void {
    this.commands.set(command, handler);
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    logger.info('Telegram polling started', 'TelegramPoller');
    void this.loop();
  }

  stop(): void {
    this.active = false;
    logger.info('Telegram polling stopped', 'TelegramPoller');
  }

  // ── Private ────────────────────────────────────────────────────────────

  private async loop(): Promise<void> {
    while (this.active) {
      try {
        const updates = await this.fetchUpdates();
        for (const update of updates) {
          await this.dispatch(update);
        }
      } catch (err) {
        logger.error('Telegram poll error', 'TelegramPoller', {
          error: err instanceof Error ? err.message : String(err),
        });
        await sleep(5000);
      }
    }
  }

  private async fetchUpdates(): Promise<TelegramUpdate[]> {
    const url = `${TELEGRAM_API}/bot${this.botToken}/getUpdates`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offset: this.lastUpdateId + 1, timeout: POLL_TIMEOUT_SEC }),
    });
    const data = (await res.json()) as TelegramResponse<TelegramUpdate[]>;
    if (!data.ok || !data.result) return [];
    return data.result;
  }

  private async dispatch(update: TelegramUpdate): Promise<void> {
    this.lastUpdateId = update.update_id;
    const msg = update.message;
    if (!msg?.text) return;

    const chatId = String(msg.chat.id);
    const parts = msg.text.trim().split(/\s+/);
    const command = parts[0]?.toLowerCase() ?? '';
    const args = parts.slice(1);

    const handler = this.commands.get(command);
    if (handler) {
      try {
        await handler(chatId, args);
      } catch (err) {
        logger.error('Command handler error', 'TelegramPoller', { command, error: String(err) });
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
