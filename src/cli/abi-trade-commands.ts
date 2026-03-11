/**
 * AbiTrade Bot CLI commands — deep scan functionality
 * Adds specialized commands for AbiTrade Bot operations
 */

import { Command } from 'commander';
import { AbiTradeDeepScanner, IArbitrageOpportunity as ArbitrageOpportunity, DeepScanResult, DeepScanAggregate } from '../abi-trade/abi-trade-deep-scanner';
import { logger } from '../utils/logger';
import { parseList, validateMinExchanges } from '../cli/exchange-factory';
import { ExchangeClientBase } from '@agencyos/trading-core/exchanges';
import { ArbCliDashboard } from '../ui/arbitrage-cli-realtime-dashboard';
import { exportArbHistory } from '../reporting/arbitrage-trade-history-exporter';
import { PaperTradingArbBridge } from '../execution/paper-trading-arbitrage-bridge';

/** Bridge: creates ExchangeClientBase (CCXT) from generic config */
function exchangeFactory(config: { id: string; apiKey: string; secret: string }): ExchangeClientBase {
  return new ExchangeClientBase(config.id, config.apiKey, config.secret);
}

export function registerAbiTradeCommands(program: Command): void {
  program
    .command('abitrade:deepscan')
    .description('AbiTrade Bot deep scan — comprehensive multi-exchange arbitrage analysis')
    .option('-p, --pairs <string>', 'Comma-separated trading pairs', 'BTC/USDT,ETH/USDT')
    .option('-e, --exchanges <string>', 'Comma-separated exchange IDs', 'binance,bybit,okx')
    .option('-s, --size <number>', 'Max position size USD', '1000')
    .option('-t, --threshold <number>', 'Min spread %', '0.05')
    .option('--equity <number>', 'Initial equity USD', '10000')
    .option('--max-loss <number>', 'Max daily loss USD', '100')
    .option('--score-threshold <number>', 'Base signal score threshold (0-100)', '65')
    .option('--deep-scan', 'Enable deep scan features', 'true')
    .option('--correlation-threshold <number>', 'Market correlation threshold', '0.85')
    .option('--latency-buffer <number>', 'Latency buffer in ms', '200')
    .option('--paper', 'Enable paper trading mode (no real orders, virtual balances)')
    .option('--dashboard', 'Show real-time CLI dashboard (disables logger console output)')
    .option('--export <format>', 'Export trade history on exit: csv or json')
    .option('--export-path <path>', 'Export file path (default: ./abi-trade-history)', './abi-trade-history')
    .option('--max-depth <number>', 'Max depth levels for order book analysis', '10')
    .option('--volatility-window <number>', 'Window size for volatility calculation', '20')
    .action(async (options) => {
      const symbols = parseList(options.pairs);
      const exchangeIds = parseList(options.exchanges);
      validateMinExchanges(exchangeIds);

      // Paper mode: create virtual bridge, skip real exchange API validation
      let paperBridge: PaperTradingArbBridge | null = null;
      if (options.paper) {
        paperBridge = new PaperTradingArbBridge({
          exchanges: exchangeIds,
          initialBalancePerExchange: parseFloat(options.equity),
        });
        logger.info('[AbiTrade] PAPER MODE — virtual balances, no real orders');
      }

      // Dashboard mode: suppress logger console output to avoid conflict
      let dashboard: ArbCliDashboard | null = null;
      if (options.dashboard) {
        dashboard = new ArbCliDashboard(1000);
        dashboard.setPaperMode(!!options.paper);
        dashboard.start();
        // Remove console transport to avoid overwriting dashboard
        logger.transports.forEach((t) => {
          if (t.constructor.name === 'ConsoleTransport') {
            logger.remove(t);
          }
        });
      }

      logger.info(`[AbiTrade] Starting deep scan: ${exchangeIds.join('/')} | ${symbols.join(', ')} | Size: $${options.size}`);

      try {
        const config = {
          exchanges: exchangeIds,
          symbols,
          pollIntervalMs: 10000, // 10 seconds
          minNetProfitPercent: parseFloat(options.threshold),
          positionSizeUsd: parseFloat(options.size),
          maxSlippagePercent: 0.1,
          opportunityTtlMs: 5000,
          deepScanEnabled: options.deepScan !== 'false',
          correlationThreshold: parseFloat(options.correlationThreshold),
          latencyBufferMs: parseInt(options.latencyBuffer),
          maxConcurrentScans: 5,
          enableHistoricalAnalysis: true,
          enableLatencyOptimization: true,
          maxDepthLevels: parseInt(options.maxDepth),
          volumeThreshold: 10000,
          volatilityWindow: parseInt(options.volatilityWindow),
        };

        const scanner = new AbiTradeDeepScanner(config);

        // Initialize and start the scanner
        await scanner.initialize();
        scanner.start();

        logger.info('[AbiTrade] Deep scanner ACTIVE — comprehensive market analysis running');
        logger.info(`[AbiTrade] Symbols: ${symbols.join(', ')} | Exchanges: ${exchangeIds.join(', ')}`);

        // Register event handlers
        scanner.on('opportunity', (opp: ArbitrageOpportunity) => {
          logger.info(
            `[AbiTrade] OPPORTUNITY: ${opp.symbol} | Buy ${opp.buyExchange}@${opp.buyPrice} | Sell ${opp.sellExchange}@${opp.sellPrice} | Net: ${opp.netProfitPercent.toFixed(2)}% ($${opp.estimatedProfitUsd.toFixed(2)})`
          );
        });

        scanner.on('deepScanResult', (result: DeepScanResult) => {
          logger.info(
            `[AbiTrade] DEEP SCAN: ${result.opportunities.length} opportunities, ${result.correlations.length} correlations, confidence: ${result.confidenceScore.toFixed(1)}`
          );
        });

        scanner.on('deepScanAggregate', (aggregate: DeepScanAggregate) => {
          logger.info(
            `[AbiTrade] AGGREGATE: ${aggregate.totalOpportunities} total opportunities, avg confidence: ${aggregate.avgConfidence.toFixed(1)}, risk(high): ${aggregate.riskSummary.high}`
          );
        });

        const shutdown = async () => {
          scanner.stop();
          await scanner.shutdown();
          dashboard?.stop();

          // Export history on exit if requested
          if (options.export && paperBridge) {
            const fmt = options.export as 'csv' | 'json';
            const history = paperBridge.getCombinedHistory();
            const result = await exportArbHistory(history, {
              format: fmt,
              outputPath: options.exportPath,
            });
            logger.info(`[AbiTrade] Exported ${result.count} trades → ${result.path}`);
          }

          logger.info('\n[AbiTrade] === DEEP SCAN SUMMARY ===');
          logger.info('[AbiTrade] Scanner stopped.');
          process.exit(0);
        };

        process.on('SIGINT', () => { void shutdown(); });
        process.on('SIGTERM', () => { void shutdown(); });

        // Keep the process running
        await new Promise(() => {});

      } catch (error: unknown) {
        logger.error(`AbiTrade deep scan failed: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });

  program
    .command('abitrade:analyze')
    .description('AbiTrade Bot market analysis — detailed risk and correlation analysis')
    .option('-p, --pairs <string>', 'Comma-separated trading pairs', 'BTC/USDT,ETH/USDT')
    .option('-e, --exchanges <string>', 'Comma-separated exchange IDs', 'binance,bybit,okx')
    .option('--correlation-threshold <number>', 'Market correlation threshold', '0.85')
    .option('--volatility-window <number>', 'Window size for volatility calculation', '20')
    .option('--timeframe <string>', 'Timeframe for analysis (1m, 5m, 15m, 1h)', '1h')
    .action(async (options) => {
      const symbols = parseList(options.pairs);
      const exchangeIds = parseList(options.exchanges);
      validateMinExchanges(exchangeIds);

      logger.info(`[AbiTrade] Starting market analysis: ${exchangeIds.join('/')} | ${symbols.join(', ')}`);

      try {
        const config = {
          exchanges: exchangeIds,
          symbols,
          pollIntervalMs: 30000, // 30 seconds for analysis
          minNetProfitPercent: 0.01, // Very low threshold for analysis
          positionSizeUsd: 1000,
          maxSlippagePercent: 0.1,
          opportunityTtlMs: 5000,
          deepScanEnabled: true,
          correlationThreshold: parseFloat(options.correlationThreshold),
          latencyBufferMs: 200,
          maxConcurrentScans: 3,
          enableHistoricalAnalysis: true,
          enableLatencyOptimization: false,
          maxDepthLevels: 5,
          volumeThreshold: 5000,
          volatilityWindow: parseInt(options.volatilityWindow),
        };

        const scanner = new AbiTradeDeepScanner(config);

        // Initialize the scanner
        await scanner.initialize();

        // Perform one-time deep analysis
        logger.info('[AbiTrade] Performing market analysis...');

        for (const symbol of symbols) {
          const result = await (scanner as unknown as { performDeepScan: (sym: string) => Promise<unknown> }).performDeepScan(symbol);

          logger.info(`\n[AbiTrade] Analysis for ${symbol}:`);
          logger.info(`  Opportunities found: ${(result as any).opportunities.length}`);
          logger.info(`  Correlations analyzed: ${(result as any).correlations.length}`);
          logger.info(`  Risk factors identified: ${(result as any).riskFactors.length}`);
          logger.info(`  Confidence score: ${(result as any).confidenceScore.toFixed(1)}`);

          // Log top risk factors
          if ((result as any).riskFactors.length > 0) {
            logger.info('  Top Risk Factors:');
            const topRisks = (result as any).riskFactors
              .sort((a: unknown, b: unknown) => {
                const aa = a as { value: number; threshold: number };
                const bb = b as { value: number; threshold: number };
                return (bb.value / bb.threshold) - (aa.value / aa.threshold);
              })
              .slice(0, 3);

            topRisks.forEach((risk: unknown) => {
              const r = risk as { type: string; severity: string; description: string };
              logger.info(`    - ${r.type} risk (${r.severity}): ${r.description}`);
            });
          }
        }

        await scanner.shutdown();
        logger.info('[AbiTrade] Market analysis completed.');

      } catch (error: unknown) {
        logger.error(`AbiTrade analysis failed: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });
}