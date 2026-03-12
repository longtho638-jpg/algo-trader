#!/usr/bin/env node

/**
 * Polymarket Trading Bot CLI
 *
 * Usage:
 *   pnpm ts-node src/cli/polymarket-bot-command.ts start [--dry-run]
 *   pnpm ts-node src/cli/polymarket-bot-command.ts status
 *   pnpm ts-node src/cli/polymarket-bot-command.ts stop
 *
 * Environment:
 *   PRIVATE_KEY - Polygon wallet private key
 *   POLYMARKET_API_KEY - CLOB API key
 *   POLYMARKET_API_SECRET - CLOB API secret
 *   POLYMARKET_API_PASSPHRASE - CLOB API passphrase
 */

import { PolymarketBotEngine } from '../polymarket/bot-engine';
import { logger } from '../utils/logger';

const USAGE = `
Polymarket Trading Bot - 6 Strategies

Usage:
  start [--dry-run] [--strategies=<list>]  Start the bot
  status                                    Show bot status
  stop                                      Stop the bot

Options:
  --dry-run        Run without placing real orders (default: true)
  --strategies     Comma-separated list of strategies to enable

Strategies:
  - ComplementaryArb  YES+NO != 1.0 arbitrage
  - MakerBot          Two-sided market making
  - WeatherBot        Weather event prediction
  - AI Reasoning      LLM ensemble predictions
  - Hedge Discovery   Related market inconsistencies
  - Whale Tracking    Copy successful traders

Examples:
  # Start in dry run mode (safe)
  pnpm ts-node src/cli/polymarket-bot-command.ts start --dry-run

  # Start live trading (REAL MONEY)
  pnpm ts-node src/cli/polymarket-bot-command.ts start

  # Start with specific strategies
  pnpm ts-node src/cli/polymarket-bot-command.ts start --strategies=ComplementaryArb,MakerBot

Environment Variables:
  PRIVATE_KEY                      Polygon wallet private key (required)
  POLYMARKET_API_KEY               CLOB API key (required for trading)
  POLYMARKET_API_SECRET            CLOB API secret
  POLYMARKET_API_PASSPHRASE        CLOB API passphrase
  MAX_BANKROLL                     Max total capital (default: 10000)
  MAX_POSITION_PCT                 Max per position (default: 0.06)
  MAX_DAILY_LOSS                   Max daily loss (default: 0.05)
`;

let bot: PolymarketBotEngine | null = null;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || args.includes('--help') || args.includes('-h')) {
    console.log(USAGE);
    process.exit(0);
  }

  // Parse flags
  const flags: Record<string, string | boolean> = {};
  for (const arg of args.slice(1)) {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      flags[key] = value ?? true;
    }
  }

  switch (command) {
    case 'start':
      await startBot(flags);
      break;
    case 'status':
      showStatus();
      break;
    case 'stop':
      await stopBot();
      break;
    default:
      console.log(USAGE);
      process.exit(1);
  }
}

async function startBot(flags: Record<string, string | boolean>): Promise<void> {
  const dryRun = flags['dry-run'] !== false;
  const strategiesStr = flags['strategies'] as string | undefined;

  const config = {
    dryRun,
    maxBankroll: parseFloat(process.env.MAX_BANKROLL || '10000'),
    maxPositionPct: parseFloat(process.env.MAX_POSITION_PCT || '0.06'),
    maxDailyLoss: parseFloat(process.env.MAX_DAILY_LOSS || '0.05'),
    enabledStrategies: strategiesStr
      ? strategiesStr.split(',').map(s => s.trim())
      : undefined,
  };

  logger.info(`[PolyBot] Starting with config: ${JSON.stringify(config, null, 2)}`);

  if (dryRun) {
    logger.warn('⚠️  DRY RUN MODE - No real orders will be placed');
  } else {
    logger.error('⚠️  LIVE MODE - Real money at risk!');
  }

  bot = new PolymarketBotEngine(config);

  // Event handlers
  bot.on('started', (data: any) => {
    logger.info(`✅ Bot started in ${data.dryRun ? 'DRY RUN' : 'LIVE'} mode`);
  });

  bot.on('signal:executed', (data: any) => {
    const { signal } = data;
    logger.info(`📊 Signal: ${signal.action} ${signal.size} ${signal.side} @ ${signal.price}`);
  });

  bot.on('signal:rejected', (data: any) => {
    logger.warn(`❌ Signal rejected: ${data.reason}`);
  });

  bot.on('trade:executed', (order: any) => {
    logger.info(`💰 Trade executed: ${order.orderID}`);
  });

  bot.on('execution:error', (data: any) => {
    logger.error(`💥 Execution error: ${data.error}`);
  });

  // Status report every 30 seconds
  setInterval(() => {
    if (bot) {
      const status = bot.getStatus();
      logger.info(`📈 Status: ${status.executedTrades} trades | ${status.rejectedTrades} rejected | PnL: $${status.dailyPnL}`);
    }
  }, 30000);

  try {
    await bot.start();
  } catch (err) {
    logger.error('[PolyBot] Start error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // Handle shutdown
  process.on('SIGINT', async () => {
    logger.info('\n[PolyBot] Shutting down...');
    await stopBot();
    process.exit(0);
  });
}

function showStatus(): void {
  if (!bot) {
    console.log('Bot is not running');
    return;
  }

  const status = bot.getStatus();
  console.log('\n=== Polymarket Bot Status ===');
  console.log(`Running: ${status.running}`);
  console.log(`Mode: ${status.mode}`);
  console.log(`Uptime: ${status.uptimeHuman}`);
  console.log(`Total Signals: ${status.totalSignals}`);
  console.log(`Executed Trades: ${status.executedTrades}`);
  console.log(`Rejected Trades: ${status.rejectedTrades}`);
  console.log(`Daily PnL: $${status.dailyPnL}`);
  console.log(`Daily Volume: $${status.dailyVolume}`);
  console.log('\nStrategies:');
  for (const s of status.strategies) {
    console.log(`  - ${s.name}: ${s.enabled ? '✅' : '❌'} (${s.signalCount} signals)`);
  }
  console.log('=============================\n');
}

async function stopBot(): Promise<void> {
  if (!bot) {
    logger.warn('[PolyBot] Bot not running');
    return;
  }

  try {
    await bot.stop();
    logger.info('[PolyBot] Bot stopped');
    bot = null;
  } catch (err) {
    logger.error('[PolyBot] Stop error:', err instanceof Error ? err.message : String(err));
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(err => {
    logger.error('Fatal error:', err);
    process.exit(1);
  });
}

export { main };
