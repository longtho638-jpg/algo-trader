// Historical price data loader for backtesting engine
// Supports CSV files, JSON files, in-memory arrays, and synthetic data generation

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/** OHLCV candle structure for backtesting */
export interface HistoricalCandle {
  /** Unix timestamp in milliseconds */
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Options for synthetic data generation */
export interface SyntheticDataOptions {
  /** Daily volatility as decimal (0.02 = 2%). Default: 0.02 */
  volatility?: number;
  /** Slight upward drift per day as decimal. Default: 0.0005 */
  drift?: number;
}

// ─── CSV loader ───────────────────────────────────────────────────────────────

/** Parse a single CSV row into a HistoricalCandle */
function parseCsvRow(row: string, headers: string[]): HistoricalCandle | null {
  const cols = row.split(',').map(c => c.trim());
  if (cols.length < 6) return null;

  const idx = (name: string) => headers.indexOf(name);

  const tsRaw = cols[idx('timestamp') !== -1 ? idx('timestamp') : 0];
  const timestamp = isNaN(Number(tsRaw)) ? new Date(tsRaw).getTime() : Number(tsRaw);

  return {
    timestamp,
    open: parseFloat(cols[idx('open') !== -1 ? idx('open') : 1]),
    high: parseFloat(cols[idx('high') !== -1 ? idx('high') : 2]),
    low: parseFloat(cols[idx('low') !== -1 ? idx('low') : 3]),
    close: parseFloat(cols[idx('close') !== -1 ? idx('close') : 4]),
    volume: parseFloat(cols[idx('volume') !== -1 ? idx('volume') : 5]),
  };
}

/**
 * Load OHLCV data from a CSV file.
 * Expected columns: timestamp,open,high,low,close,volume
 */
export function loadFromCsv(filePath: string): HistoricalCandle[] {
  const raw = readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n').filter(l => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const candles: HistoricalCandle[] = [];

  for (let i = 1; i < lines.length; i++) {
    const candle = parseCsvRow(lines[i], headers);
    if (candle && !isNaN(candle.close)) candles.push(candle);
  }

  return candles.sort((a, b) => a.timestamp - b.timestamp);
}

// ─── JSON loader ──────────────────────────────────────────────────────────────

/** Load OHLCV data from a JSON file (array of candle objects) */
export function loadFromJson(filePath: string): HistoricalCandle[] {
  const raw = readFileSync(filePath, 'utf-8');
  const data = JSON.parse(raw) as Partial<HistoricalCandle>[];
  return loadFromArray(data);
}

// ─── Array loader ─────────────────────────────────────────────────────────────

/**
 * Load candles from an in-memory array.
 * Validates and normalizes each entry.
 */
export function loadFromArray(data: Partial<HistoricalCandle>[]): HistoricalCandle[] {
  const candles: HistoricalCandle[] = [];

  for (const item of data) {
    if (!item.timestamp || item.close === undefined) continue;
    const close = item.close;
    candles.push({
      timestamp: item.timestamp,
      open: item.open ?? close,
      high: item.high ?? close,
      low: item.low ?? close,
      close,
      volume: item.volume ?? 0,
    });
  }

  return candles.sort((a, b) => a.timestamp - b.timestamp);
}

// ─── Synthetic data generator ─────────────────────────────────────────────────

/**
 * Generate synthetic OHLCV data using random walk with configurable volatility.
 * Useful for strategy testing without real market data.
 */
export function generateMockData(
  symbol: string,
  days: number,
  startPrice: number,
  options: SyntheticDataOptions = {},
): HistoricalCandle[] {
  void symbol; // reserved for future seeding
  const { volatility = 0.02, drift = 0.0005 } = options;
  const candles: HistoricalCandle[] = [];
  const MS_PER_DAY = 86_400_000;
  const startTs = Date.now() - days * MS_PER_DAY;

  let price = startPrice;

  for (let i = 0; i < days; i++) {
    const timestamp = startTs + i * MS_PER_DAY;
    const change = (Math.random() - 0.5 + drift) * price * volatility;
    const open = price;
    const close = Math.max(0.01, price + change);
    const high = Math.max(open, close) * (1 + Math.random() * volatility * 0.5);
    const low = Math.min(open, close) * (1 - Math.random() * volatility * 0.5);
    const volume = Math.random() * 1_000_000 + 100_000;

    candles.push({ timestamp, open, high, low, close, volume });
    price = close;
  }

  return candles;
}

// ─── loadHistoricalData ───────────────────────────────────────────────────────

const DATA_DIR = new URL('./data', import.meta.url).pathname;

/**
 * Load historical candles for a given market and date range.
 *
 * Resolution order:
 *  1. src/backtest/data/<market>.json  (JSON ticks)
 *  2. src/backtest/data/<market>.csv   (CSV OHLCV)
 *  3. Falls back to synthetic random-walk data (60 days, start price 0.5)
 *
 * @param market    Market identifier, e.g. "sample-polymarket"
 * @param startDate Inclusive start (Date or ISO string)
 * @param endDate   Inclusive end   (Date or ISO string)
 */
export function loadHistoricalData(
  market: string,
  startDate: Date | string,
  endDate: Date | string,
): HistoricalCandle[] {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();

  let candles: HistoricalCandle[] = [];

  const jsonPath = join(DATA_DIR, `${market}.json`);
  const csvPath = join(DATA_DIR, `${market}.csv`);

  if (existsSync(jsonPath)) {
    candles = loadFromJson(jsonPath);
  } else if (existsSync(csvPath)) {
    candles = loadFromCsv(csvPath);
  } else {
    // Synthetic fallback: 60-day random walk
    const days = Math.ceil((end - start) / 86_400_000) || 60;
    candles = generateMockData(market, days, 0.5);
    // Align timestamps to requested range
    const delta = start - candles[0].timestamp;
    candles = candles.map(c => ({ ...c, timestamp: c.timestamp + delta }));
  }

  return candles.filter(c => c.timestamp >= start && c.timestamp <= end);
}

// ─── Streaming iterator ───────────────────────────────────────────────────────

/**
 * Async generator to iterate candles one by one.
 * Useful for streaming large datasets without loading all into memory.
 */
export async function* candleIterator(candles: HistoricalCandle[]): AsyncGenerator<HistoricalCandle> {
  for (const candle of candles) {
    yield candle;
  }
}
