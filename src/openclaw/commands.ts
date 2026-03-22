// OpenClaw CLI commands - AI trading control interface
// Usage: algo-trade openclaw <subcommand> [options]

import { Command } from 'commander';
import { AiRouter } from './ai-router.js';
import { loadOpenClawConfig } from './openclaw-config.js';
import { logger } from '../core/logger.js';

type OperationMode = 'manual' | 'semi-auto' | 'full-auto';

interface OpenClawGlobalOpts {
  mode?: OperationMode;
  verbose?: boolean;
}

interface ReportOptions extends OpenClawGlobalOpts { period: 'daily' | 'weekly' }
interface ObserveOptions extends OpenClawGlobalOpts { duration: string }

// ─── Formatting helpers ───────────────────────────────────────────────────────

function printHeader(title: string): void {
  logger.info(`=== OpenClaw: ${title} ===`, 'OpenClaw');
}

function printSection(label: string, content: string): void {
  logger.info(`[${label}] ${content.split('\n').join(' ')}`, 'OpenClaw');
}

function printKV(key: string, value: string | number): void {
  logger.info(`${key}: ${value}`, 'OpenClaw');
}

// ─── Action implementations ───────────────────────────────────────────────────

async function runAnalyze(opts: OpenClawGlobalOpts): Promise<void> {
  printHeader('Trade Analysis');
  const router = new AiRouter();
  if (opts.verbose) logger.info(`Routing to model: ${router.getModel('complex')}`, 'OpenClaw');
  try {
    const resp = await router.chat({
      prompt: 'Analyze recent algorithmic trading activity and provide key insights on performance, patterns, and risk.',
      systemPrompt: 'You are an expert algorithmic trading analyst. Be concise and actionable.',
      complexity: 'complex',
      maxTokens: 512,
    });
    printSection('Insights', resp.content);
    if (opts.verbose) {
      printKV('Model', resp.model);
      printKV('Tokens', resp.tokensUsed);
      printKV('Latency (ms)', resp.latencyMs);
    }
  } catch (err) {
    logger.error(`Error: ${err instanceof Error ? err.message : String(err)}`, 'OpenClaw');
    process.exit(1);
  }
}

async function runTune(strategy: string, opts: OpenClawGlobalOpts): Promise<void> {
  printHeader(`Strategy Tuning: ${strategy}`);
  const router = new AiRouter();
  if (opts.verbose) logger.info(`Routing to model: ${router.getModel('complex')}`, 'OpenClaw');
  try {
    const resp = await router.chat({
      prompt: `Provide parameter tuning suggestions for the "${strategy}" strategy. Include entry/exit thresholds, position sizing, and risk controls.`,
      systemPrompt: `You are a quant trading specialist. Mode: ${opts.mode ?? 'manual'}. Be specific with numbers.`,
      complexity: 'complex',
      maxTokens: 600,
    });
    printSection('Tuning Suggestions', resp.content);
    if (opts.verbose) {
      printKV('Mode', opts.mode ?? 'manual');
      printKV('Model', resp.model);
      printKV('Latency (ms)', resp.latencyMs);
    }
  } catch (err) {
    logger.error(`Error: ${err instanceof Error ? err.message : String(err)}`, 'OpenClaw');
    process.exit(1);
  }
}

async function runReport(opts: ReportOptions): Promise<void> {
  const period = opts.period ?? 'daily';
  printHeader(`Performance Report (${period})`);
  const router = new AiRouter();
  try {
    const resp = await router.chat({
      prompt: `Generate a ${period} performance report: trade summary, P&L, win rate, top strategies, and recommendations.`,
      systemPrompt: 'You are a trading performance analyst. Format the report with clear sections.',
      complexity: 'standard',
      maxTokens: 800,
    });
    printSection(`${period.toUpperCase()} REPORT`, resp.content);
    if (opts.verbose) printKV('Latency (ms)', resp.latencyMs);
  } catch (err) {
    logger.error(`Error: ${err instanceof Error ? err.message : String(err)}`, 'OpenClaw');
    process.exit(1);
  }
}

async function runObserve(opts: ObserveOptions): Promise<void> {
  const duration = parseInt(opts.duration, 10) || 60;
  printHeader(`Live Observation (${duration}s)`);
  const router = new AiRouter();
  logger.info(`Starting live observation for ${duration}s — mode: ${opts.mode ?? 'manual'}`, 'OpenClaw');

  const endTime = Date.now() + duration * 1000;
  const tickMs = Math.min(duration * 100, 10_000); // ~10% of duration, max 10s
  let tick = 0;

  const interval = setInterval(() => {
    if (Date.now() >= endTime) { clearInterval(interval); logger.info('Observation complete.', 'OpenClaw'); return; }
    tick++;
    const label = `T+${String(tick).padStart(3, '0')}`;
    router.chat({
      prompt: `Tick ${tick}: Flag any immediate trading signals or market anomalies.`,
      systemPrompt: 'You are a real-time market monitor. One sentence per observation.',
      complexity: 'simple',
      maxTokens: 128,
    }).then((r) => logger.info(`${label} ${r.content.trim()}`, 'OpenClaw'))
      .catch(() => logger.warn(`${label} Observation failed, retrying...`, 'OpenClaw'));
  }, tickMs);
}

function runStatus(opts: OpenClawGlobalOpts): void {
  printHeader('System Status');
  const config = loadOpenClawConfig();
  printKV('Gateway URL', config.gatewayUrl);
  printKV('API Key', config.apiKey ? '*** (set)' : '(not set)');
  printKV('Timeout (ms)', config.timeout);
  printKV('Model (simple)', config.routing.simple);
  printKV('Model (standard)', config.routing.standard);
  printKV('Model (complex)', config.routing.complex);
  printKV('Mode', opts.mode ?? 'manual');
  printKV('Last analysis', 'N/A (runtime state)');
  if (opts.verbose) logger.info('Set OPENCLAW_GATEWAY_URL, OPENCLAW_API_KEY to configure.', 'OpenClaw');
}

// ─── Command factory ──────────────────────────────────────────────────────────

/** Create the OpenClaw command group to register with the CLI program */
export function createOpenClawCommands(): Command {
  const openclaw = new Command('openclaw')
    .description('OpenClaw AI trading control — analysis, tuning, and observation')
    .option('--mode <mode>', 'operation mode: manual|semi-auto|full-auto', 'manual')
    .option('--verbose', 'enable verbose output');

  openclaw.command('analyze')
    .description('Run AI analysis on recent trades and print insights')
    .action(() => { void runAnalyze(openclaw.opts<OpenClawGlobalOpts>()); });

  openclaw.command('tune <strategy>')
    .description('Get AI tuning suggestions for a named strategy')
    .action((strategy: string) => { void runTune(strategy, openclaw.opts<OpenClawGlobalOpts>()); });

  openclaw.command('report')
    .description('Generate AI performance report')
    .option('--period <period>', 'report period: daily|weekly', 'daily')
    .action((cmdOpts: { period: 'daily' | 'weekly' }) => {
      void runReport({ ...openclaw.opts<OpenClawGlobalOpts>(), period: cmdOpts.period });
    });

  openclaw.command('observe')
    .description('Start live AI observation for N seconds')
    .option('--duration <seconds>', 'observation duration in seconds', '60')
    .action((cmdOpts: { duration: string }) => {
      void runObserve({ ...openclaw.opts<OpenClawGlobalOpts>(), duration: cmdOpts.duration });
    });

  openclaw.command('status')
    .description('Show OpenClaw system status: gateway, models, last analysis')
    .action(() => { runStatus(openclaw.opts<OpenClawGlobalOpts>()); });

  return openclaw;
}
