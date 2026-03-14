// src/cex-index.ts
// Entry point for CEX arbitrage bot (Binance/OKX/Bybit)

import { ExchangeClientBase } from './lib/exchange-client-base';
import { FundingRateArbitrageScanner } from './execution/funding-rate-arbitrage-scanner';
import { TriangularArbitrageLiveScanner } from './execution/triangular-arbitrage-live-scanner';
import { RealtimeArbitrageScanner } from './execution/realtime-arbitrage-scanner';
import { WebSocketPriceFeedManager } from './execution/websocket-multi-exchange-price-feed-manager';
import { BinhPhapStealthStrategy } from './execution/binh-phap-stealth-trading-strategy';
import { loadArbitrageConfig } from './arbitrage/arbitrage-config';
import { logger } from './utils/logger';

const config = loadArbitrageConfig();
const exchanges = (process.env.CEX_EXCHANGES || 'binance,okx,bybit').split(',');
const symbols = (process.env.CEX_SYMBOLS || 'BTC/USDT,ETH/USDT').split(',');
const dryRun = (process.env.DRY_RUN || 'true') === 'true';

async function main() {
  logger.info(`=== CEX ARB START (${dryRun ? 'DRY RUN' : 'LIVE'}) ===`);
  logger.info(`Exchanges: ${exchanges.join(', ')}`);
  logger.info(`Symbols: ${symbols.join(', ')}`);

  // 1. Initialize exchange clients
  const clients = new Map<string, ExchangeClientBase>();
  for (const id of exchanges) {
    try {
      const client = new ExchangeClientBase(id);
      await client.initialize();
      const health = await client.checkHealth();
      logger.info(`[${id}] Connected (health: ${health})`);
      clients.set(id, client);
    } catch (e: any) {
      logger.error(`[${id}] Failed: ${e.message}`);
    }
  }

  if (clients.size < 2) {
    logger.error('Need at least 2 exchanges for arbitrage');
    process.exit(1);
  }

  // 2. Start WebSocket price feeds
  const wsFeed = new WebSocketPriceFeedManager({ exchanges, symbols });
  wsFeed.start();
  logger.info('[WS] Price feeds started');

  // 3. Initialize stealth engine
  const stealth = new BinhPhapStealthStrategy({
    defaultMode: 'split',
    minConfidenceScore: 70,
    enableExchangeRotation: true,
  });

  // 4. Start scanners
  // 4a. Cross-exchange spot arb (real-time via WS)
  const realtimeScanner = new RealtimeArbitrageScanner({
    symbols,
    minNetSpreadPct: parseFloat(process.env.CEX_MIN_SPREAD || '0.05'),
    positionSizeUsd: parseFloat(process.env.CEX_POSITION_SIZE || '500'),
  });
  wsFeed.on('tick', (tick: any) => realtimeScanner.onTick(tick));
  realtimeScanner.on('opportunity', (opp: any) => {
    logger.info(`[SpotArb] ${opp.spread.symbol}: BUY@${opp.spread.buyExchange} SELL@${opp.spread.sellExchange} | Net: ${opp.spread.netSpreadPct.toFixed(3)}%`);
    if (!dryRun) {
      const plan = stealth.planExecution(opp.spread.buyExchange, opp.spread.netSpreadPct / 100, opp.spread.symbol);
      if (plan.shouldProceed) {
        logger.info(`[Stealth] Executing ${plan.mode} with ${plan.sizes.length} chunks`);
      }
    }
  });

  // 4b. Funding rate arb
  const fundingScanner = new FundingRateArbitrageScanner({
    minRateDifferential: parseFloat(process.env.CEX_MIN_FUNDING_DIFF || '0.0005'),
    scanIntervalMs: 30000,
  });
  fundingScanner.on('opportunity', (opp: any) => {
    logger.info(`[FundingArb] ${opp.symbol}: SHORT@${opp.shortExchange}(${(opp.shortRate*100).toFixed(3)}%) LONG@${opp.longExchange}(${(opp.longRate*100).toFixed(3)}%) | APR: ${opp.annualizedReturnPct.toFixed(1)}%`);
  });

  // 4c. Triangular arb (single exchange)
  const triScanners: TriangularArbitrageLiveScanner[] = [];
  for (const [id] of clients) {
    const tri = new TriangularArbitrageLiveScanner({
      baseCurrency: 'USDT',
      minProfitPct: parseFloat(process.env.CEX_MIN_TRI_PROFIT || '0.001'),
      feePct: 0.001,
    });
    tri.on('opportunity', (opp: any) => {
      logger.info(`[TriArb] ${id}: ${opp.path} | Profit: ${(opp.profitPct*100).toFixed(3)}%`);
    });
    triScanners.push(tri);
  }

  // 5. Feed funding rates periodically
  setInterval(async () => {
    for (const [id, client] of clients) {
      for (const symbol of symbols) {
        try {
          const perpSymbol = symbol.replace('/', ':');
          const rate = await client.fetchFundingRate(perpSymbol);
          if (rate) {
            fundingScanner.updateRate({
              exchange: id,
              symbol: symbol,
              rate: rate.fundingRate || 0,
              nextFundingTime: rate.fundingTimestamp || Date.now() + 28800000,
              updatedAt: Date.now(),
            });
          }
        } catch {} // not all exchanges/symbols support funding
      }
    }
  }, 30000);

  // 6. Feed price ticks to triangular scanner
  wsFeed.on('tick', (tick: any) => {
    for (const tri of triScanners) {
      tri.onTick?.(tick);
    }
  });

  logger.info('=== CEX ARB RUNNING ===');

  // Shutdown
  const shutdown = () => {
    logger.info('Shutting down...');
    wsFeed.stop();
    realtimeScanner.stop?.();
    fundingScanner.stop?.();
    triScanners.forEach(t => t.stop?.());
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(e => { logger.error('Fatal:', e); process.exit(1); });
