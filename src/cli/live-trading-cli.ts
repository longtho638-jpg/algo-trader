#!/usr/bin/env node

/**
 * Polymarket Live Trading CLI
 *
 * Commands:
 *   live:start [--dry-run] [--strategies=<list>] [--port=<n>]
 *   live:stop [--all | --strategy=<name>]
 *   live:status [--verbose] [--json]
 *   live:configure --key=<name> --value=<value>
 *
 * Environment:
 *   PRIVATE_KEY - Polygon wallet private key
 *   POLYMARKET_API_KEY - CLOB API key
 *   POLYMARKET_API_SECRET - CLOB API secret
 *   POLYMARKET_API_PASSPHRASE - CLOB API passphrase
 */

import { PolymarketBotEngine } from '../polymarket/bot-engine';
import { logger } from '../utils/logger';

let bot: PolymarketBotEngine | null = null;

/**
 * Start the trading bot
 */
async function startBot(flags: Record<string, string | boolean>): Promise<void> {
  const dryRun = flags['dry-run'] !== false;
  const strategiesStr = flags['strategies'] as string | undefined;

  const config = {
    dryRun,
    maxBankroll: parseFloat(process.env.MAX_BANKROLL || '10000'),
    maxPositionPct: parseFloat(process.env.MAX_POSITION_PCT || '0.06'),
    maxDailyLoss: parseFloat(process.env.MAX_DAILY_LOSS || '0.05'),
    enabledStrategies: strategiesStr
      ? strategiesStr.split(',').map((s: string) => s.trim())
      : undefined,
  };

  logger.info(`[LiveCLI] Starting with config: ${JSON.stringify(config, null, 2)}`);

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
    logger.info(`💰 Trade executed: ${order.orderId}`);
  });

  bot.on('execution:error', (data: any) => {
    logger.error(`💥 Execution error: ${data.error}`);
  });

  // Status report every 30 seconds
  setInterval(() => {
    if (bot) {
      const status = bot.getStatus();
      logger.info(
        `📈 Status: ${status.executedTrades} trades | ${status.rejectedTrades} rejected | PnL: $${status.dailyPnL}`
      );
    }
  }, 30000);

  try {
    await bot.start();
  } catch (err) {
    logger.error(
      '[LiveCLI] Start error:',
      err instanceof Error ? err.message : String(err)
    );
    process.exit(1);
  }

  // Handle shutdown
  process.on('SIGINT', async () => {
    logger.info('\n[LiveCLI] Shutting down...');
    await stopBot();
    process.exit(0);
  });
}

/**
 * Stop the trading bot
 */
async function stopBot(strategyName?: string): Promise<void> {
  if (!bot) {
    logger.warn('[LiveCLI] Bot not running');
    return;
  }

  try {
    if (strategyName) {
      logger.info(`[LiveCLI] Stopping strategy: ${strategyName}`);
      // Note: BotEngine doesn't support per-strategy stop yet
      // This would require extending PolymarketBotEngine
    }
    await bot.stop();
    logger.info('[LiveCLI] Bot stopped');
    bot = null;
  } catch (err) {
    logger.error(
      '[LiveCLI] Stop error:',
      err instanceof Error ? err.message : String(err)
    );
  }
}

/**
 * Show bot status
 */
function showStatus(flags: Record<string, string | boolean>): void {
  if (!bot) {
    console.log('Bot is not running');
    return;
  }

  const status = bot.getStatus();

  if (flags['json']) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  console.log('\n=== Polymarket Bot Status ===');
  console.log(`Running: ${status.running}`);
  console.log(`Mode: ${status.mode}`);
  console.log(`Uptime: ${status.uptimeHuman}`);
  console.log(`Total Signals: ${status.totalSignals}`);
  console.log(`Executed Trades: ${status.executedTrades}`);
  console.log(`Rejected Trades: ${status.rejectedTrades}`);
  console.log(`Daily PnL: $${status.dailyPnL}`);
  console.log(`Daily Volume: $${status.dailyVolume}`);

  if (flags['verbose']) {
    console.log('\nStrategies:');
    for (const s of status.strategies) {
      console.log(`  - ${s.name}: ${s.enabled ? '✅' : '❌'} (${s.signalCount} signals)`);
    }
  }
  console.log('=============================\n');
}

/**
 * Configure bot runtime parameters
 */
function configureBot(key: string, value: string): void {
  logger.info(`[LiveCLI] Configure: ${key} = ${value}`);
  // Note: Runtime config would require extending PolymarketBotEngine
  // For now, this is a placeholder for future implementation
  logger.warn('[LiveCLI] Runtime config not yet implemented - restart bot to apply changes');
}

/**
 * Parse CLI flags
 */
function parseFlags(args: string[]): Record<string, string | boolean> {
  const flags: Record<string, string | boolean> = {};
  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      flags[key] = value ?? true;
    }
  }
  return flags;
}

/**
 * Register live:* commands with Commander
 */
export function registerLiveTradingCommands(program: any): void {
  program
    .command('live:start')
    .description('Start Polymarket live trading bot')
    .option('--dry-run', 'Run without placing real orders (default: true)', true)
    .option('--strategies <list>', 'Comma-separated list of strategies to enable')
    .option('--port <n>', 'API server port (for future HTTP API)', '3000')
    .action(async (options: any) => {
      const flags = parseFlags(process.argv.slice(process.argv.indexOf('live:start') + 1));
      await startBot({ ...options, ...flags });
    });

  program
    .command('live:stop')
    .description('Stop Polymarket live trading bot')
    .option('--all', 'Stop all strategies (default)')
    .option('--strategy <name>', 'Stop specific strategy')
    .action(async (options: any) => {
      await stopBot(options.strategy);
    });

  program
    .command('live:status')
    .description('Show Polymarket bot status')
    .option('--verbose', 'Show detailed strategy status')
    .option('--json', 'Output as JSON')
    .action((options: any) => {
      showStatus(options);
    });

  program
    .command('live:configure')
    .description('Configure bot runtime parameters')
    .requiredOption('--key <name>', 'Configuration key')
    .requiredOption('--value <value>', 'Configuration value')
    .action((options: any) => {
      configureBot(options.key, options.value);
    });
}

export { startBot, stopBot, showStatus, configureBot };
