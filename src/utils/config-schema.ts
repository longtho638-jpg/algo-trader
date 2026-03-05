/**
 * Zod validation schemas for algo-trader configuration.
 * Validates environment variables at startup to catch misconfiguration early.
 */

import { z } from 'zod';

export const ExchangeCredentialsSchema = z.object({
  EXCHANGE_API_KEY: z.string().min(10, 'API key must be at least 10 chars'),
  EXCHANGE_SECRET: z.string().min(10, 'API secret must be at least 10 chars'),
});

export const TradingConfigSchema = z.object({
  EXCHANGE_ID: z.string().min(1).default('binance'),
  TRADING_PAIR: z.string().regex(/^[A-Z0-9]+\/[A-Z0-9]+$/, 'Must be format BASE/QUOTE').default('BTC/USDT'),
  TIMEFRAME: z.enum(['1m', '5m', '15m', '1h', '4h', '1d']).default('1h'),
  RSI_PERIOD: z.coerce.number().int().positive().default(14),
  SMA_SHORT: z.coerce.number().int().positive().default(9),
  SMA_LONG: z.coerce.number().int().positive().default(21),
  MAX_POSITION_SIZE: z.coerce.number().positive().max(1, 'Must be 0-1 fraction').default(0.1),
  STOP_LOSS_PCT: z.coerce.number().positive().max(100).default(2),
  TAKE_PROFIT_PCT: z.coerce.number().positive().max(100).default(4),
  MAX_DAILY_LOSS: z.coerce.number().positive().max(100).default(5),
});

export const LogConfigSchema = z.object({
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']).default('info'),
  LOG_FILE: z.string().optional(),
});

export const AppConfigSchema = z.object({
  ...ExchangeCredentialsSchema.shape,
  ...TradingConfigSchema.shape,
  ...LogConfigSchema.shape,
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

/**
 * Parse and validate process.env against AppConfigSchema.
 * Throws ZodError with human-readable messages on failure.
 */
export function validateConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = AppConfigSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues
      .map(i => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Config validation failed:\n${issues}`);
  }
  return result.data;
}
