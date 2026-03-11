/**
 * Exchange factory — Shared exchange validation + construction for arb CLI commands.
 * Routes to exchange-specific adapters (Binance, OKX, Bybit) with optimized fee/config.
 * Falls back to generic ExchangeClientBase for unsupported exchanges.
 *
 * All exchange primitives from @agencyos/trading-core/exchanges (single source of truth).
 */

import {
  ExchangeClientBase,
  BinanceAdapter,
  OkxAdapter,
  BybitAdapter,
} from '@agencyos/trading-core/exchanges';
import { logger } from '../utils/logger';

/**
 * Create exchange-specific adapter based on exchange ID.
 * Uses optimized adapter for Binance/OKX/Bybit, generic ExchangeClientBase for others.
 */
export function createExchangeAdapter(
  id: string,
  apiKey?: string,
  secret?: string,
): ExchangeClientBase {
  switch (id.toLowerCase()) {
    case 'binance':
      return new BinanceAdapter({ apiKey, secret, useBnbDiscount: false });
    case 'okx':
      return new OkxAdapter({ apiKey, secret });
    case 'bybit':
      return new BybitAdapter({ apiKey, secret });
    default:
      return new ExchangeClientBase(id, apiKey, secret);
  }
}

export interface ExchangeEntry {
  id: string;
  apiKey: string;
  secret: string;
  enabled: boolean;
}

/**
 * Parse comma-separated exchange IDs, validate API keys from env, return ExchangeEntry[].
 * Exits process with error if any exchange missing API key.
 */
export function buildExchangeConfigs(exchangeIds: string[]): ExchangeEntry[] {
  return exchangeIds.map((id: string) => {
    const apiKey = process.env[`${id.toUpperCase()}_API_KEY`] || '';
    const secret = process.env[`${id.toUpperCase()}_SECRET`] || '';

    if (!apiKey || apiKey.length < 10) {
      logger.error(`Missing API key for ${id}. Set ${id.toUpperCase()}_API_KEY in .env`);
      process.exit(1);
    }

    return { id, apiKey, secret, enabled: true };
  });
}

/**
 * Create ExchangeClient instances from exchange IDs (no API key validation).
 * Used by arb:scan (dry-run, no keys needed).
 */
export function buildExchangeClients(exchangeIds: string[]): Map<string, ExchangeClientBase> {
  const clients = new Map<string, ExchangeClientBase>();

  for (const id of exchangeIds) {
    try {
      const client = createExchangeAdapter(id);
      clients.set(id, client);
    } catch (err) {
      logger.warn(`Skipping ${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return clients;
}

/**
 * Create authenticated ExchangeClient instances (with API keys).
 * Used by arb:run.
 */
export function buildAuthenticatedClients(exchangeIds: string[]): Map<string, ExchangeClientBase> {
  const clients = new Map<string, ExchangeClientBase>();

  for (const id of exchangeIds) {
    const apiKey = process.env[`${id.toUpperCase()}_API_KEY`] || '';
    const secret = process.env[`${id.toUpperCase()}_SECRET`] || '';

    if (!apiKey || apiKey.length < 10) {
      logger.error(`Missing API key for ${id}. Set ${id.toUpperCase()}_API_KEY in .env`);
      process.exit(1);
    }

    const client = createExchangeAdapter(id, apiKey, secret);
    clients.set(id, client);
  }

  return clients;
}

/**
 * Parse comma-separated string into trimmed array.
 */
export function parseList(csv: string): string[] {
  return csv.split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * Validate minimum exchange count for arbitrage.
 */
export function validateMinExchanges(ids: string[], min: number = 2): void {
  if (ids.length < min) {
    logger.error(`Need at least ${min} exchanges for arbitrage, got ${ids.length}`);
    process.exit(1);
  }
}
