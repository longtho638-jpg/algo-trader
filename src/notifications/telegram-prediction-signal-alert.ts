// Telegram alert for Polymarket prediction signals
// Sends formatted signal message when edge opportunity is detected
// Uses TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID from env — no external deps

import type { PredictionSignal } from '../openclaw/prediction-probability-estimator.js';
import { logger } from '../core/logger.js';

const TELEGRAM_API = 'https://api.telegram.org';

interface TelegramResponse {
  ok: boolean;
  description?: string;
}

// ── formatSignalMessage ────────────────────────────────────────────────────

/**
 * Format a PredictionSignal into a Telegram-ready markdown message.
 * Example output:
 *   📊 Signal: BUY YES
 *   Market: `Will X happen by Y?`
 *   Edge: `+8.3%`  Confidence: `72%`
 *   Our prob: `0.623`  Market: `0.540`
 */
function formatSignalMessage(signal: PredictionSignal): string {
  const directionLabel =
    signal.direction === 'buy_yes' ? '🟢 BUY YES'
    : signal.direction === 'buy_no' ? '🔴 BUY NO'
    : '⏭ SKIP';

  const edgePct = (signal.edge * 100).toFixed(1);
  const confPct = (signal.confidence * 100).toFixed(0);
  const sign = signal.edge >= 0 ? '+' : '';

  return [
    `*📊 Signal: ${directionLabel}*`,
    `Market: \`${signal.marketId}\``,
    `Edge: \`${sign}${edgePct}%\`  Confidence: \`${confPct}%\``,
    `Our prob: \`${signal.ourProb.toFixed(3)}\`  Market: \`${signal.marketProb.toFixed(3)}\``,
    `Model: \`${signal.model}\``,
    `_${new Date().toISOString()}_`,
  ].join('\n');
}

// ── sendTelegramAlert ──────────────────────────────────────────────────────

/**
 * Send a prediction signal alert via Telegram Bot API.
 * Reads TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID from process.env.
 * Non-throwing — logs errors but never crashes the caller.
 *
 * @param signal - PredictionSignal to broadcast
 */
export async function sendTelegramAlert(signal: PredictionSignal): Promise<void> {
  const token  = process.env['TELEGRAM_BOT_TOKEN'];
  const chatId = process.env['TELEGRAM_CHAT_ID'];

  if (!token || !chatId) {
    logger.warn(
      'Telegram not configured — set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID',
      'TelegramSignalAlert',
    );
    return;
  }

  // Skip signals that have no actionable direction
  if (signal.direction === 'skip') {
    logger.debug('Signal direction=skip — suppressing alert', 'TelegramSignalAlert', {
      marketId: signal.marketId,
      edge: signal.edge,
    });
    return;
  }

  const text = formatSignalMessage(signal);
  const url  = `${TELEGRAM_API}/bot${token}/sendMessage`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    });

    const data = (await res.json()) as TelegramResponse;

    if (!data.ok) {
      logger.warn('Telegram API rejected message', 'TelegramSignalAlert', {
        description: data.description,
        marketId: signal.marketId,
      });
    } else {
      logger.info('Signal alert sent', 'TelegramSignalAlert', {
        marketId: signal.marketId,
        direction: signal.direction,
        edge: signal.edge,
      });
    }
  } catch (err) {
    // Non-critical: alert failure must never block trading logic
    logger.error('Telegram send failed', 'TelegramSignalAlert', {
      error: err instanceof Error ? err.message : String(err),
      marketId: signal.marketId,
    });
  }
}
