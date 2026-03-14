/**
 * Arb scan and run commands — arb:scan, arb:run.
 */

import { Command } from 'commander';
import { ArbitrageScanner } from '../arbitrage/arbitrage-scanner';
import { ArbitrageExecutor } from '../arbitrage/arbitrage-executor';
import { logger } from '../utils/logger';
import {
  parseList,
  validateMinExchanges,
  buildExchangeClients,
  buildAuthenticatedClients,
} from './exchange-factory';

export function registerArbScan(program: Command): void {
  program
    .command('arb:scan')
    .description('Scan cross-exchange arbitrage opportunities (dry-run)')
    .option('-p, --pairs <string>', 'Comma-separated trading pairs', 'BTC/USDT,ETH/USDT')
    .option('-e, --exchanges <string>', 'Comma-separated exchange IDs', 'binance,okx,bybit,gateio')
    .option('-t, --threshold <number>', 'Min spread % to report', '0.1')
    .option('-n, --polls <number>', 'Number of poll cycles', '10')
    .action(async (options) => {
      const symbols = parseList(options.pairs);
      const exchangeIds = parseList(options.exchanges);
      const threshold = parseFloat(options.threshold);
      const maxPolls = parseInt(options.polls);

      logger.info(`[ArbScan] Scanning ${symbols.join(', ')} across ${exchangeIds.join(', ')} (threshold: ${threshold}%)`);

      const scanner = new ArbitrageScanner({
        symbols,
        minSpreadPercent: threshold,
        pollIntervalMs: 3000,
      });

      const clients = buildExchangeClients(exchangeIds);
      for (const [id, client] of clients) {
        scanner.addExchange(id, client);
      }

      let pollCount = 0;
      scanner.onOpportunity(opp => {
        logger.info(
          `[ARB] ${opp.symbol}: BUY@${opp.buyExchange}=$${opp.buyPrice.toFixed(2)} → SELL@${opp.sellExchange}=$${opp.sellPrice.toFixed(2)} | ` +
          `Spread: ${opp.spreadPercent.toFixed(3)}% | Net: ${opp.netProfitPercent.toFixed(3)}% | Est: $${opp.estimatedProfitUsd.toFixed(2)}`
        );
      });

      try {
        await scanner.start();

        const checkInterval = setInterval(() => {
          pollCount++;
          const stats = scanner.getStats();
          if (pollCount % 5 === 0) {
            logger.info(`[ArbScan] Poll ${stats.totalPolls} | Opportunities: ${stats.opportunitiesFound} | Avg latency: ${stats.avgLatencyMs.toFixed(0)}ms`);
          }
          if (stats.totalPolls >= maxPolls) {
            clearInterval(checkInterval);
            scanner.stop();
            logger.info(`[ArbScan] Scan complete: ${stats.totalPolls} polls, ${stats.opportunitiesFound} opportunities found`);
          }
        }, 3000);
      } catch (error: unknown) {
        logger.error(`Arb scan failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
}

export function registerArbRun(program: Command): void {
  program
    .command('arb:run')
    .description('Run live cross-exchange arbitrage bot')
    .option('-p, --pairs <string>', 'Comma-separated trading pairs', 'BTC/USDT,ETH/USDT')
    .option('-e, --exchanges <string>', 'Comma-separated exchange IDs', 'binance,okx')
    .option('-s, --size <number>', 'Max position size USD', '500')
    .option('-t, --threshold <number>', 'Min spread %', '0.15')
    .action(async (options) => {
      const symbols = parseList(options.pairs);
      const exchangeIds = parseList(options.exchanges);
      validateMinExchanges(exchangeIds);

      logger.info(`[ArbBot] Starting: ${exchangeIds.join(' vs ')} | Pairs: ${symbols.join(', ')} | Max: $${options.size}`);

      const scanner = new ArbitrageScanner({
        symbols,
        minSpreadPercent: parseFloat(options.threshold),
        pollIntervalMs: 2000,
        positionSizeUsd: parseFloat(options.size),
      });

      const executor = new ArbitrageExecutor({
        maxPositionSizeUsd: parseFloat(options.size),
        maxConcurrentTrades: 3,
        cooldownMs: 10000,
      });

      const clients = buildAuthenticatedClients(exchangeIds);
      for (const [id, client] of clients) {
        scanner.addExchange(id, client);
        executor.addExchange(id, client);
      }

      scanner.onOpportunity(async (opp) => {
        const result = await executor.execute(opp);
        if (result.success) {
          executor.printDashboard();
        }
      });

      try {
        await scanner.start();
        logger.info('[ArbBot] Running. Press Ctrl+C to stop.');

        const shutdown = () => {
          scanner.stop();
          executor.printDashboard();
          process.exit(0);
        };
        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
      } catch (error: unknown) {
        logger.error(`Arb bot failed: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });
}
