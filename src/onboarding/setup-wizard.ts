// Interactive CLI setup wizard for first-run onboarding configuration
import { createInterface } from 'node:readline';
import { existsSync } from 'node:fs';
import { generateApiKey, generateWebhookSecret } from './api-key-generator.js';
import { logger } from '../core/logger.js';

export type ExchangeName = 'polymarket' | 'binance' | 'bybit' | 'okx';
export type NotificationChannel = 'telegram' | 'discord' | 'slack' | 'none';

export interface SetupResult {
  environment: 'development' | 'staging' | 'production';
  exchanges: {
    polymarket?: { privateKey: string };
    binance?: { apiKey: string; apiSecret: string };
    bybit?: { apiKey: string; apiSecret: string };
    okx?: { apiKey: string; apiSecret: string; passphrase?: string };
  };
  riskLimits: {
    maxPositionSize: string;
    maxDrawdown: number;
    maxOpenPositions: number;
    stopLossPercent: number;
    maxLeverage: number;
  };
  notificationChannel: NotificationChannel;
  notificationToken?: string;
  platformApiKey?: string;
  webhookSecret?: string;
}

/** Prompt user and return trimmed answer; returns defaultValue on empty input */
function ask(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

/** Prompt with a default value shown in brackets */
async function askWithDefault(
  rl: ReturnType<typeof createInterface>,
  question: string,
  defaultValue: string,
): Promise<string> {
  const answer = await ask(rl, `${question} [${defaultValue}]: `);
  return answer === '' ? defaultValue : answer;
}

/** Prompt for a yes/no question; returns true for y/yes */
async function askYesNo(
  rl: ReturnType<typeof createInterface>,
  question: string,
  defaultYes = false,
): Promise<boolean> {
  const hint = defaultYes ? 'Y/n' : 'y/N';
  const answer = await ask(rl, `${question} (${hint}): `);
  if (answer === '') return defaultYes;
  return answer.toLowerCase().startsWith('y');
}

/** Collect exchange credentials interactively */
async function collectExchangeCredentials(
  rl: ReturnType<typeof createInterface>,
  exchanges: ExchangeName[],
): Promise<SetupResult['exchanges']> {
  const result: SetupResult['exchanges'] = {};

  for (const ex of exchanges) {
    logger.info(`Configure ${ex}`, 'SetupWizard');
    if (ex === 'polymarket') {
      const privateKey = await ask(rl, '    Polygon private key (0x...): ');
      result.polymarket = { privateKey };
    } else if (ex === 'binance') {
      const apiKey = await ask(rl, '    Binance API key: ');
      const apiSecret = await ask(rl, '    Binance API secret: ');
      result.binance = { apiKey, apiSecret };
    } else if (ex === 'bybit') {
      const apiKey = await ask(rl, '    Bybit API key: ');
      const apiSecret = await ask(rl, '    Bybit API secret: ');
      result.bybit = { apiKey, apiSecret };
    } else if (ex === 'okx') {
      const apiKey = await ask(rl, '    OKX API key: ');
      const apiSecret = await ask(rl, '    OKX API secret: ');
      const passphrase = await ask(rl, '    OKX passphrase (leave blank if none): ');
      result.okx = { apiKey, apiSecret, ...(passphrase ? { passphrase } : {}) };
    }
  }

  return result;
}

/**
 * Run the interactive first-run setup wizard.
 * Skips if .env already exists unless user confirms overwrite.
 */
export async function runSetupWizard(envPath = '.env'): Promise<SetupResult | null> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    logger.info('╔══════════════════════════════════════╗', 'SetupWizard');
    logger.info('║   algo-trade — First Run Setup       ║', 'SetupWizard');
    logger.info('╚══════════════════════════════════════╝', 'SetupWizard');

    // Skip if .env exists and user declines overwrite
    if (existsSync(envPath)) {
      logger.info(`Found existing ${envPath}.`, 'SetupWizard');
      const overwrite = await askYesNo(rl, '  Overwrite existing config?', false);
      if (!overwrite) {
        logger.info('Setup cancelled — existing config kept.', 'SetupWizard');
        return null;
      }
    }

    // Step 1: Environment
    logger.info('Step 1/5 — Environment', 'SetupWizard');
    const envRaw = await askWithDefault(rl, '  Environment (development/staging/production)', 'development');
    const environment = (['development', 'staging', 'production'].includes(envRaw)
      ? envRaw
      : 'development') as SetupResult['environment'];

    // Step 2: Exchange selection
    logger.info('Step 2/5 — Exchange Selection', 'SetupWizard');
    logger.info('Available: polymarket, binance, bybit, okx (comma-separated)', 'SetupWizard');
    const exchangeRaw = await askWithDefault(rl, '  Exchanges to configure', 'polymarket');
    const exchanges = exchangeRaw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s): s is ExchangeName =>
        ['polymarket', 'binance', 'bybit', 'okx'].includes(s),
      );

    // Step 3: API keys
    logger.info('Step 3/5 — API Credentials', 'SetupWizard');
    const exchangeCredentials = await collectExchangeCredentials(rl, exchanges);

    // Step 4: Risk limits
    logger.info('Step 4/5 — Risk Limits', 'SetupWizard');
    const maxPositionSize = await askWithDefault(rl, '  Max position size (USD)', '10000');
    const maxDrawdownRaw = await askWithDefault(rl, '  Max drawdown % (e.g. 20)', '20');
    const maxOpenPositionsRaw = await askWithDefault(rl, '  Max open positions', '10');
    const stopLossRaw = await askWithDefault(rl, '  Stop-loss % per position (e.g. 10)', '10');
    const maxLeverageRaw = await askWithDefault(rl, '  Max leverage (e.g. 2)', '2');

    const riskLimits: SetupResult['riskLimits'] = {
      maxPositionSize,
      maxDrawdown: parseFloat(maxDrawdownRaw) / 100,
      maxOpenPositions: parseInt(maxOpenPositionsRaw, 10),
      stopLossPercent: parseFloat(stopLossRaw) / 100,
      maxLeverage: parseFloat(maxLeverageRaw),
    };

    // Step 5: Notification channel
    logger.info('Step 5/5 — Notifications', 'SetupWizard');
    logger.info('Channels: telegram, discord, slack, none', 'SetupWizard');
    const channelRaw = await askWithDefault(rl, '  Notification channel', 'none');
    const notificationChannel = (['telegram', 'discord', 'slack', 'none'].includes(channelRaw)
      ? channelRaw
      : 'none') as NotificationChannel;

    let notificationToken: string | undefined;
    if (notificationChannel !== 'none') {
      const label =
        notificationChannel === 'telegram' ? 'Bot token' : 'Webhook URL';
      notificationToken = await ask(rl, `  ${notificationChannel} ${label}: `);
    }

    // Auto-generate platform API key and webhook secret
    const platformApiKey = generateApiKey();
    const webhookSecret = generateWebhookSecret();

    logger.info('Setup complete.', 'SetupWizard');
    logger.info(`Platform API key: ${platformApiKey}`, 'SetupWizard');
    logger.info(`Webhook secret: ${webhookSecret}`, 'SetupWizard');
    logger.info('(These are also written to your .env file)', 'SetupWizard');

    return {
      environment,
      exchanges: exchangeCredentials,
      riskLimits,
      notificationChannel,
      notificationToken,
      platformApiKey,
      webhookSecret,
    };
  } finally {
    rl.close();
  }
}
