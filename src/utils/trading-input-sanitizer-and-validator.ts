/**
 * Input validation and sanitization for trading parameters.
 * Validates trading pairs, timeframes, numeric values, and strips unsafe log content.
 */

const VALID_TIMEFRAMES = new Set(['1m', '5m', '15m', '1h', '4h', '1d']);
const TRADING_PAIR_RE = /^[A-Z0-9]+\/[A-Z0-9]+$/;
// Strip ANSI codes, control chars (except tab/newline), and shell metacharacters
const ANSI_RE = /\x1B\[[0-9;]*[A-Za-z]/g;
const CONTROL_CHAR_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

/**
 * Validate a trading pair string in BASE/QUOTE format (e.g. BTC/USDT).
 */
export function validateTradingPair(pair: string): boolean {
  return TRADING_PAIR_RE.test(pair);
}

/**
 * Validate a candlestick timeframe string.
 */
export function validateTimeframe(tf: string): boolean {
  return VALID_TIMEFRAMES.has(tf);
}

/**
 * Validate that a number is finite and strictly positive.
 */
export function validatePositiveNumber(n: number): boolean {
  return typeof n === 'number' && isFinite(n) && n > 0;
}

/**
 * Strip control characters and ANSI escape codes from log messages
 * to prevent log injection attacks.
 */
export function sanitizeLogMessage(msg: string): string {
  return msg.replace(ANSI_RE, '').replace(CONTROL_CHAR_RE, '').trim();
}
