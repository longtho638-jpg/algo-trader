// Backtest command - run strategy simulation against historical data
// Usage: algo-trade backtest --strategy <name> --from <date> --to <date> [--capital <amount>] [--market <id>]

import { Command } from 'commander';
import { loadConfig } from '../../core/config.js';
import { logger } from '../../core/logger.js';
import type { StrategyName } from '../../core/types.js';
import { loadHistoricalData } from '../../backtest/data-loader.js';
import { runBacktest, type BacktestConfig, type BacktestStrategy, type SimulatorState } from '../../backtest/simulator.js';
import { formatBacktestResult } from '../../backtest/report-generator.js';
import type { HistoricalCandle } from '../../backtest/data-loader.js';
import type { TradeRequest } from '../../engine/trade-executor.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BacktestResult {
  strategy: StrategyName;
  fromDate: string;
  toDate: string;
  initialCapital: number;
  finalEquity: number;
  totalReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  totalTrades: number;
  winRate: number;
  profitFactor: number;
}

interface BacktestOptions {
  strategy: string;
  from: string;
  to: string;
  capital: string;
  market: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_STRATEGIES: StrategyName[] = [
  'cross-market-arb',
  'market-maker',
  'grid-trading',
  'dca-bot',
  'funding-rate-arb',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseDate(str: string, label: string): Date {
  const d = new Date(str);
  if (isNaN(d.getTime())) {
    console.error(`Error: invalid ${label} date "${str}". Use ISO format: YYYY-MM-DD`);
    process.exit(1);
  }
  return d;
}

function validateStrategy(name: string): name is StrategyName {
  return (VALID_STRATEGIES as string[]).includes(name);
}

// ─── Momentum strategy adapter for CLI ────────────────────────────────────────
// Buys on rising candles, sells on falling candles (simple trend-following).

function buildMomentumStrategy(strategyName: StrategyName, capital: number): BacktestStrategy {
  let prevClose: number | null = null;
  const tradeSize = (capital * 0.05).toFixed(2);

  return {
    onCandle(candle: HistoricalCandle, state: SimulatorState): TradeRequest | null {
      const prev = prevClose;
      prevClose = candle.close;
      if (prev === null) return null;

      const rising = candle.close > prev;
      const falling = candle.close < prev;

      if (rising && state.position <= 0 && state.balance > parseFloat(tradeSize)) {
        return {
          marketType: 'polymarket',
          exchange: 'polymarket',
          symbol: 'POLY_BACKTEST',
          side: 'buy',
          size: tradeSize,
          strategy: strategyName,
        };
      }

      if (falling && state.position > 0) {
        return {
          marketType: 'polymarket',
          exchange: 'polymarket',
          symbol: 'POLY_BACKTEST',
          side: 'sell',
          size: String(state.position.toFixed(2)),
          strategy: strategyName,
        };
      }

      return null;
    },
  };
}

// ─── Command ──────────────────────────────────────────────────────────────────

export const backtestCommand = new Command('backtest')
  .description('Run historical backtest for a strategy')
  .requiredOption('-s, --strategy <name>', `strategy to backtest (${VALID_STRATEGIES.join(', ')})`)
  .requiredOption('-f, --from <date>', 'start date in YYYY-MM-DD format')
  .requiredOption('-t, --to <date>', 'end date in YYYY-MM-DD format')
  .option('-c, --capital <amount>', 'initial capital in USD', '10000')
  .option('-m, --market <id>', 'market data file in src/backtest/data/ (without extension)', 'sample-polymarket')
  .action(async (opts: BacktestOptions) => {
    if (!validateStrategy(opts.strategy)) {
      console.error(`Error: unknown strategy "${opts.strategy}"`);
      console.error(`Valid strategies: ${VALID_STRATEGIES.join(', ')}`);
      process.exit(1);
    }

    const fromDate = parseDate(opts.from, '--from');
    const toDate = parseDate(opts.to, '--to');

    if (fromDate >= toDate) {
      console.error('Error: --from date must be before --to date');
      process.exit(1);
    }

    const capital = parseFloat(opts.capital);
    if (isNaN(capital) || capital <= 0) {
      console.error('Error: --capital must be a positive number');
      process.exit(1);
    }

    let config;
    try {
      config = loadConfig();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Config error: ${msg}`);
      process.exit(1);
    }

    logger.setLevel(config.logLevel);

    console.log('\n  === algo-trade backtest ===\n');
    console.log(`  Strategy : ${opts.strategy}`);
    console.log(`  Market   : ${opts.market}`);
    console.log(`  From     : ${opts.from}`);
    console.log(`  To       : ${opts.to}`);
    console.log(`  Capital  : $${capital.toFixed(2)}`);
    console.log('');

    try {
      // Load historical candles
      const candles = loadHistoricalData(opts.market, fromDate, toDate);
      if (candles.length === 0) {
        console.error(`  Error: no candle data found for market "${opts.market}" in [${opts.from} → ${opts.to}]`);
        console.error(`  Tip: place a JSON or CSV file in src/backtest/data/${opts.market}.json`);
        process.exit(1);
      }

      console.log(`  Loaded ${candles.length} candles for "${opts.market}"\n`);

      // Build config + strategy
      const btConfig: BacktestConfig = {
        initialCapital: capital,
        slippage: 0.001,
        feeRate: 0.001,
        strategy: opts.strategy as StrategyName,
      };

      const strategy = buildMomentumStrategy(opts.strategy as StrategyName, capital);

      // Run simulation
      logger.info(`Running backtest: ${opts.strategy}`, 'cli:backtest', {
        candles: candles.length, capital,
      });

      const result = await runBacktest(strategy, candles, btConfig);

      // Print report
      console.log(formatBacktestResult(result));
      console.log('');

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  Backtest failed: ${msg}`);
      process.exit(1);
    }
  });
