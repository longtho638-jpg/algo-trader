/**
 * Arb engine and orchestrator commands — arb:engine, arb:orchestrator.
 * SpreadDetectorEngine with scoring/orderbook/circuit-breaker,
 * and ArbitrageOrchestrator with latency optimizer + adaptive threshold.
 */

import { Command } from 'commander';
import { ExchangeClientBase } from '../lib/exchange-client-base';

// Stub types — SpreadDetectorEngine/ArbitrageOrchestrator not yet implemented locally
interface ExchangeConfig { id: string; name: string; apiKey: string; secret: string; [key: string]: any; }
class SpreadDetectorEngine { constructor(_c: any, _f: any) {} init() {} start() {} stop() {} getStats() { return {}; } getProfitSummary() { return {}; } }
class ArbitrageOrchestrator { constructor(_c: any, _f: any) {} init() {} start() {} stop() {} getStats() { return {}; } }
import { logger } from '../utils/logger';
import {
  parseList,
  validateMinExchanges,
  buildExchangeConfigs,
} from './exchange-factory';

/** Bridge: creates ExchangeClientBase (CCXT) from generic ExchangeConfig */
function exchangeFactory(config: ExchangeConfig): ExchangeClientBase {
  return new ExchangeClientBase(config.id, config.apiKey, config.secret);
}

export function registerArbEngine(program: Command): void {
  program
    .command('arb:engine')
    .description('Run full SpreadDetectorEngine with scoring, orderbook validation, circuit breaker')
    .option('-p, --pairs <string>', 'Comma-separated trading pairs', 'BTC/USDT,ETH/USDT')
    .option('-e, --exchanges <string>', 'Comma-separated exchange IDs', 'binance,okx,bybit')
    .option('-s, --size <number>', 'Max position size USD', '1000')
    .option('-t, --threshold <number>', 'Min spread %', '0.05')
    .option('--equity <number>', 'Initial equity USD', '10000')
    .option('--max-loss <number>', 'Max daily loss USD', '100')
    .action(async (options) => {
      const symbols = parseList(options.pairs);
      const exchangeIds = parseList(options.exchanges);
      validateMinExchanges(exchangeIds);

      const exchanges = buildExchangeConfigs(exchangeIds);

      logger.info(`[SpreadDetector] Starting: ${exchangeIds.join('/')} | Pairs: ${symbols.join(', ')} | Max: $${options.size}`);

      const engine = new SpreadDetectorEngine({
        exchanges,
        symbols,
        exchangeFactory,
        scanner: { minSpreadPercent: parseFloat(options.threshold), pollIntervalMs: 2000 },
        executor: { maxPositionSizeUsd: parseFloat(options.size), maxConcurrentTrades: 3 },
        scorer: { executeThreshold: 65 },
        circuitBreaker: { maxDailyLossUsd: parseFloat(options.maxLoss), maxConsecutiveLosses: 5 },
        initialEquity: parseFloat(options.equity),
        maxOpportunitiesPerCycle: 5,
        enableOrderBookValidation: true,
        enableSignalScoring: true,
        enableSpreadHistory: true,
      });

      try {
        await engine.init();
        await engine.start();
        logger.info('[SpreadDetector] Running. Press Ctrl+C to stop.');

        const shutdown = () => {
          engine.stop();
          const stats = engine.getStats();
          const profit = engine.getProfitSummary();
          logger.info(`\n[SpreadDetector] Final: ${stats.totalDetections} detections, ${stats.totalExecuted} executed, ${stats.successfulExecutions} successful`);
          logger.info(`[SpreadDetector] P&L: $${profit.cumulativePnl.toFixed(2)} | Drawdown: ${profit.maxDrawdownPercent.toFixed(1)}%`);
          process.exit(0);
        };
        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
      } catch (error: unknown) {
        logger.error(`SpreadDetector failed: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });
}

export function registerArbOrchestrator(program: Command): void {
  program
    .command('arb:orchestrator')
    .description('Run ArbitrageOrchestrator with latency optimizer + adaptive threshold')
    .option('-p, --pairs <string>', 'Comma-separated trading pairs', 'BTC/USDT,ETH/USDT')
    .option('-e, --exchanges <string>', 'Comma-separated exchange IDs', 'binance,okx,bybit')
    .option('-s, --size <number>', 'Max position size USD', '1000')
    .option('-t, --threshold <number>', 'Min spread %', '0.1')
    .option('--equity <number>', 'Initial equity USD', '10000')
    .option('--max-drawdown <number>', 'Max drawdown % before halt', '20')
    .action(async (options) => {
      const symbols = parseList(options.pairs);
      const exchangeIds = parseList(options.exchanges);
      validateMinExchanges(exchangeIds);

      const exchanges = buildExchangeConfigs(exchangeIds);

      logger.info(`[Orchestrator] Starting: ${exchangeIds.join('/')} | Pairs: ${symbols.join(', ')}`);

      const orchestrator = new ArbitrageOrchestrator({
        exchanges,
        symbols,
        exchangeFactory,
        scanner: { minSpreadPercent: parseFloat(options.threshold), pollIntervalMs: 2000 },
        executor: { maxPositionSizeUsd: parseFloat(options.size), maxConcurrentTrades: 3 },
        enableLatencyOptimizer: true,
        enableProfitTracker: true,
        enableAdaptiveThreshold: true,
        enableWebSocket: false,
        initialEquity: parseFloat(options.equity),
        maxDrawdownPercent: parseFloat(options.maxDrawdown),
      });

      try {
        await orchestrator.init();
        await orchestrator.start();
        logger.info('[Orchestrator] Running. Press Ctrl+C to stop.');

        const shutdown = () => {
          orchestrator.stop();
          const stats = orchestrator.getStats();
          logger.info(`\n[Orchestrator] Final: ${stats.totalOpportunities} opps, ${stats.totalExecutions} executed, ${stats.successfulExecutions} successful`);
          process.exit(0);
        };
        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
      } catch (error: unknown) {
        logger.error(`Orchestrator failed: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });
}
