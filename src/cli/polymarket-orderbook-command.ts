/**
 * Polymarket Order Book CLI Command
 *
 * Real-time order book visualization and analysis.
 */

import { Command } from 'commander';
import { PolymarketAdapter } from '../execution/polymarket-adapter';
import { OrderBookAnalyzer } from '../analysis/orderbook/OrderBookAnalyzer';
import { renderOrderBookSnapshotASCII, renderOrderBookCompact } from '../visualization/orderbook-snapshot';
import { renderDepthChartASCII } from '../visualization/orderbook-depth-chart';
import { logger } from '../utils/logger';

/**
 * Register polymarket:orderbook command
 */
export function registerPolymarketOrderbookCommand(program: Command): void {
  program
    .command('polymarket:orderbook')
    .description('Show real-time Polymarket order book')
    .requiredOption('--token <tokenId>', 'Token ID (outcome token)')
    .option('--depth <N>', 'Number of depth levels', '10')
    .option('--chart', 'Show depth chart visualization')
    .option('--metrics', 'Show detailed metrics')
    .option('--interval <ms>', 'Refresh interval in ms', '2000')
    .option('--compact', 'Show compact single-line view')
    .action(async (options) => {
      const adapter = new PolymarketAdapter();

      try {
        logger.info(`Connecting to Polymarket...`);
        await adapter.connect();

        const analyzer = new OrderBookAnalyzer({
          depthLevels: parseInt(options.depth, 10),
        });

        let lastBook: any = null;

        const poll = async () => {
          try {
            const book = await adapter.getOrderBook(options.token);

            // Detect order book updates
            if (lastBook) {
              // Could track dynamics here
            }
            lastBook = book;

            // Process snapshot
            const snapshot = analyzer.processSnapshot(
              book,
              options.token,
              options.token, // marketId = tokenId for simplicity
              Date.now()
            );

            const metrics = analyzer.computeMetrics(snapshot);

            // Clear screen for live view
            if (process.stdout.isTTY) {
              process.stdout.write('\x1Bc');
            }

            // Render based on options
            if (options.compact) {
              console.log(renderOrderBookCompact(snapshot));
              console.log(`Imbalance: ${metrics.imbalance.toFixed(3)} | Score: ${metrics.liquidityScore}/100`);
            } else if (options.chart) {
              console.log(renderDepthChartASCII(snapshot, 80, 24));
              console.log('');
              console.log(`Imbalance: ${metrics.imbalance.toFixed(3)} | VWAP Bid: ${metrics.bidVWAP.toFixed(4)} | VWAP Ask: ${metrics.askVWAP.toFixed(4)}`);
            } else {
              console.log(renderOrderBookSnapshotASCII(snapshot, metrics));
            }

            // Show slippage estimate for standard size
            const slippageBuy = analyzer.estimateSlippage(snapshot, 100, 'BUY');
            const slippageSell = analyzer.estimateSlippage(snapshot, 100, 'SELL');
            console.log('');
            console.log(`Slippage (100 shares): BUY ${slippageBuy.slippageBps.toFixed(1)}bps | SELL ${slippageSell.slippageBps.toFixed(1)}bps`);

            if (options.metrics) {
              console.log('');
              console.log('Detailed Metrics:');
              console.log(`  Imbalance (3/5/10): ${metrics.imbalance3.toFixed(3)} / ${metrics.imbalance5.toFixed(3)} / ${metrics.imbalance10.toFixed(3)}`);
              console.log(`  Total Bid Vol: ${metrics.totalBidVolume.toFixed(0)} | Total Ask Vol: ${metrics.totalAskVolume.toFixed(0)}`);
              console.log(`  Liquidity Zones: ${metrics.concentrationZones.length}`);
              if (metrics.concentrationZones.length > 0) {
                metrics.concentrationZones.slice(0, 3).forEach((zone, i) => {
                  console.log(`    ${i + 1}. ${zone.side} @ ${zone.price.toFixed(4)}: ${zone.totalSize.toFixed(0)} shares (sig: ${zone.significance.toFixed(2)})`);
                });
              }
            }
          } catch (err) {
            logger.error('Error fetching order book:', err instanceof Error ? err.message : String(err));
          }
        };

        // Initial poll
        await poll();

        // Continue polling
        const interval = parseInt(options.interval, 10);
        logger.info(`Updating every ${interval}ms. Press Ctrl+C to stop.`);

        setInterval(poll, interval);

        // Keep process alive
        process.on('SIGINT', () => {
          logger.info('Disconnecting...');
          adapter.disconnect();
          process.exit(0);
        });

      } catch (err) {
        logger.error('Failed to connect:', err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}

/**
 * Register polymarket:orderbook:analyze command
 */
export function registerPolymarketOrderbookAnalyzeCommand(program: Command): void {
  program
    .command('polymarket:orderbook:analyze')
    .description('Analyze order book for a market')
    .requiredOption('--market <marketId>', 'Market/Condition ID')
    .option('--token <tokenId>', 'Token ID (defaults to market ID)')
    .option('--depth <N>', 'Depth levels', '10')
    .option('--samples <N>', 'Number of samples', '10')
    .option('--interval <ms>', 'Sampling interval', '1000')
    .option('--output <file>', 'Save results to file')
    .action(async (options) => {
      const adapter = new PolymarketAdapter();
      const tokenId = options.token || options.market;

      try {
        logger.info(`Connecting to Polymarket...`);
        await adapter.connect();

        const analyzer = new OrderBookAnalyzer({
          depthLevels: parseInt(options.depth, 10),
        });

        const samples: any[] = [];
        const sampleCount = parseInt(options.samples, 10);
        const interval = parseInt(options.interval, 10);

        logger.info(`Collecting ${sampleCount} samples...`);

        for (let i = 0; i < sampleCount; i++) {
          try {
            const book = await adapter.getOrderBook(tokenId);
            const snapshot = analyzer.processSnapshot(book, tokenId, options.market, Date.now());
            const metrics = analyzer.computeMetrics(snapshot);

            samples.push({
              timestamp: Date.now(),
              midPrice: snapshot.midPrice,
              spreadBps: snapshot.spreadBps,
              imbalance: metrics.imbalance,
              liquidityScore: metrics.liquidityScore,
              bidVWAP: metrics.bidVWAP,
              askVWAP: metrics.askVWAP,
              totalBidVolume: metrics.totalBidVolume,
              totalAskVolume: metrics.totalAskVolume,
            });

            logger.info(`Sample ${i + 1}/${sampleCount}: Mid=${snapshot.midPrice.toFixed(4)} Spread=${snapshot.spreadBps.toFixed(1)}bps Imbalance=${metrics.imbalance.toFixed(3)}`);
          } catch (err) {
            logger.error(`Sample ${i + 1} failed:`, err instanceof Error ? err.message : String(err));
          }

          if (i < sampleCount - 1) {
            await new Promise(resolve => setTimeout(resolve, interval));
          }
        }

        // Calculate statistics
        const midPrices = samples.map(s => s.midPrice);
        const spreads = samples.map(s => s.spreadBps);
        const imbalances = samples.map(s => s.imbalance);

        const avgMid = midPrices.reduce((a, b) => a + b, 0) / midPrices.length;
        const avgSpread = spreads.reduce((a, b) => a + b, 0) / spreads.length;
        const avgImbalance = imbalances.reduce((a, b) => a + b, 0) / imbalances.length;

        const minMid = Math.min(...midPrices);
        const maxMid = Math.max(...midPrices);

        console.log('');
        console.log('=== Order Book Analysis Report ===');
        console.log(`Market: ${options.market}`);
        console.log(`Samples: ${sampleCount} | Interval: ${interval}ms`);
        console.log('');
        console.log('Price Statistics:');
        console.log(`  Average Mid: ${avgMid.toFixed(4)}`);
        console.log(`  Min Mid: ${minMid.toFixed(4)}`);
        console.log(`  Max Mid: ${maxMid.toFixed(4)}`);
        console.log(`  Range: ${((maxMid - minMid) * 100).toFixed(2)}%`);
        console.log('');
        console.log('Liquidity Statistics:');
        console.log(`  Average Spread: ${avgSpread.toFixed(1)} bps`);
        console.log(`  Average Imbalance: ${avgImbalance.toFixed(3)} (${avgImbalance > 0 ? 'BUY' : 'SELL'} pressure)`);
        console.log(`  Average Liquidity Score: ${samples.reduce((a, s) => a + s.liquidityScore, 0) / samples.length | 0}/100`);

        // Slippage analysis
        const lastSample = samples[samples.length - 1];
        if (lastSample) {
          console.log('');
          console.log('Slippage Analysis (based on last sample):');

          for (const size of [50, 100, 250, 500]) {
            const book = await adapter.getOrderBook(tokenId);
            const snapshot = analyzer.processSnapshot(book, tokenId, options.market, Date.now());

            const buySlip = analyzer.estimateSlippage(snapshot, size, 'BUY');
            const sellSlip = analyzer.estimateSlippage(snapshot, size, 'SELL');

            console.log(`  ${size.toString().padStart(4)} shares: BUY ${buySlip.slippageBps.toFixed(1)}bps | SELL ${sellSlip.slippageBps.toFixed(1)}bps | Fillable: ${buySlip.fillable}/${sellSlip.fillable}`);
          }
        }

        if (options.output) {
          const fs = await import('fs');
          fs.writeFileSync(options.output, JSON.stringify({ samples, statistics: { avgMid, avgSpread, avgImbalance } }, null, 2));
          logger.info(`Results saved to ${options.output}`);
        }

      } catch (err) {
        logger.error('Analysis failed:', err instanceof Error ? err.message : String(err));
        process.exit(1);
      } finally {
        await adapter.disconnect();
      }
    });
}
