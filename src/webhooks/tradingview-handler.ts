// TradingView webhook signal parser, validator, and secret management
// Handles both JSON alert format and TV text template format
// Emits 'tradingview.signal' event on the global EventBus
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { getEventBus } from '../events/event-bus.js';
import type { UserStore } from '../users/user-store.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TradingViewSignal {
  userId: string;
  ticker: string;
  action: 'buy' | 'sell' | 'close';
  price: number;
  message: string;
  time: string;
  marketId: string | null;
}

/** Raw JSON payload from TradingView alert */
interface TvJsonPayload {
  ticker?: unknown;
  action?: unknown;
  price?: unknown;
  message?: unknown;
  time?: unknown;
}

// ─── Ticker → market mapping ──────────────────────────────────────────────────

/** Static ticker map; extend or replace with DB-backed lookup as needed */
const TICKER_MAP: Record<string, string> = {
  'POLYMARKET:TRUMP_WIN': 'polymarket-trump-win-2024',
  'POLYMARKET:BTCUSD':    'polymarket-btcusd',
};

function mapTickerToMarket(ticker: string): string | null {
  return TICKER_MAP[ticker] ?? null;
}

// ─── Action normaliser ────────────────────────────────────────────────────────

function normaliseAction(raw: string): 'buy' | 'sell' | 'close' | null {
  const lower = raw.trim().toLowerCase();
  if (lower === 'buy'  || lower === 'long')  return 'buy';
  if (lower === 'sell' || lower === 'short') return 'sell';
  if (lower === 'close' || lower === 'flat') return 'close';
  return null;
}

// ─── Parsers ──────────────────────────────────────────────────────────────────

/**
 * Parse TradingView JSON alert format:
 * { ticker, action, price, message?, time? }
 */
export function parseTvJsonAlert(body: unknown): Omit<TradingViewSignal, 'userId' | 'marketId'> | null {
  if (!body || typeof body !== 'object') return null;
  const p = body as TvJsonPayload;

  const ticker = typeof p.ticker === 'string' ? p.ticker.trim() : null;
  const actionRaw = typeof p.action === 'string' ? p.action : null;
  const price = typeof p.price === 'number' ? p.price : parseFloat(String(p.price ?? ''));

  if (!ticker || !actionRaw || isNaN(price)) return null;

  const action = normaliseAction(actionRaw);
  if (!action) return null;

  return {
    ticker,
    action,
    price,
    message: typeof p.message === 'string' ? p.message : '',
    time:    typeof p.time    === 'string' ? p.time    : new Date().toISOString(),
  };
}

/**
 * Parse TradingView text template format:
 * "{{ticker}} {{strategy.order.action}} @ {{strategy.order.price}}"
 * Example: "BTCUSDT buy @ 65000"
 */
export function parseTvTextAlert(text: string): Omit<TradingViewSignal, 'userId' | 'marketId'> | null {
  const match = /^(\S+)\s+(\S+)\s+@\s+([\d.]+)/.exec(text.trim());
  if (!match) return null;

  const [, ticker, actionRaw, priceStr] = match;
  const price = parseFloat(priceStr!);
  const action = normaliseAction(actionRaw!);

  if (!ticker || !action || isNaN(price)) return null;

  return {
    ticker: ticker.toUpperCase(),
    action,
    price,
    message: text,
    time:    new Date().toISOString(),
  };
}

// ─── Secret management ────────────────────────────────────────────────────────

/** Generate a cryptographically random 64-char hex webhook secret */
export function generateWebhookSecret(): string {
  return randomBytes(32).toString('hex');
}

/** Constant-time comparison of two strings */
function constantEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** Validate incoming X-TV-Secret against user's stored secret */
export function validateWebhookSecret(
  userId: string,
  providedSecret: string,
  userStore: UserStore,
): boolean {
  const stored = userStore.getTvWebhookSecret(userId);
  if (!stored) return false;
  return constantEqual(stored, providedSecret);
}

// ─── Signal emitter ───────────────────────────────────────────────────────────

/**
 * Parse body (JSON or text), validate, enrich, and emit 'tradingview.signal'.
 * Returns the parsed signal or null if invalid.
 */
export function processAndEmitSignal(
  userId: string,
  rawBody: string,
): TradingViewSignal | null {
  let partial: Omit<TradingViewSignal, 'userId' | 'marketId'> | null = null;

  // Try JSON first, then text format
  try {
    const json = JSON.parse(rawBody) as unknown;
    partial = parseTvJsonAlert(json);
  } catch {
    partial = parseTvTextAlert(rawBody);
  }

  if (!partial) return null;

  const signal: TradingViewSignal = {
    ...partial,
    userId,
    marketId: mapTickerToMarket(partial.ticker),
  };

  getEventBus().emit('tradingview.signal', signal);
  return signal;
}
