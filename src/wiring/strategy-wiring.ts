// Strategy wiring layer — registers strategy instances with StrategyRunner
// Pure orchestration: instantiates strategies with their dependencies and registers them.
// No strategy logic lives here.
import type { StrategyRunner, RunnableStrategy } from '../engine/strategy-runner.js';
import type { StrategyConfig } from '../core/types.js';
import type { ClobClient } from '../polymarket/clob-client.js';
import type { MarketScanner } from '../polymarket/market-scanner.js';
import type { ExchangeClient } from '../cex/exchange-client.js';
import { CrossMarketArbStrategy } from '../strategies/polymarket/cross-market-arb.js';
import { MarketMakerStrategy } from '../strategies/polymarket/market-maker.js';
import { GridTradingStrategy } from '../strategies/cex-dex/grid-trading.js';
import { DcaBotStrategy } from '../strategies/cex-dex/dca-bot.js';
import { FundingRateArbStrategy } from '../strategies/cex-dex/funding-rate-arb.js';
import type { GridConfig } from '../strategies/cex-dex/grid-trading.js';
import type { DcaSymbolConfig } from '../strategies/cex-dex/dca-bot.js';
import type { FundingArbConfig } from '../strategies/cex-dex/funding-rate-arb.js';

// ---------------------------------------------------------------------------
// Adapter helpers
// CEX/DEX strategies predate the RunnableStrategy interface and don't implement
// getStatus(). These thin wrappers add the missing method without touching the
// original strategy files.
// ---------------------------------------------------------------------------

function adaptGrid(s: GridTradingStrategy): RunnableStrategy {
  return {
    start: (...args: unknown[]) => s.start(args[0] as number),
    stop: () => s.stop(),
    getStatus: () => ({ name: 'grid-trading' }),
  };
}

function adaptDca(s: DcaBotStrategy): RunnableStrategy {
  return {
    start: () => { s.start(); return Promise.resolve(); },
    stop: () => { s.stopAll(); return Promise.resolve(); },
    getStatus: () => ({ name: 'dca-bot' }),
  };
}

function adaptFunding(s: FundingRateArbStrategy): RunnableStrategy {
  return {
    start: () => s.start(),
    stop: () => s.stop(),
    getStatus: () => ({ name: 'funding-rate-arb' }),
  };
}

// ---------------------------------------------------------------------------
// Dependency types
// ---------------------------------------------------------------------------

export interface PolymarketDeps {
  clobClient: ClobClient;
  scanner: MarketScanner;
}

export interface CexDexDeps {
  exchangeClient: ExchangeClient;
}

// ---------------------------------------------------------------------------
// Polymarket strategy wiring
// ---------------------------------------------------------------------------

/**
 * Register arb + market-maker strategies for Polymarket.
 * Both strategies are wired with shared ClobClient + MarketScanner deps.
 */
export function wirePolymarketStrategies(
  runner: StrategyRunner,
  configs: StrategyConfig[],
  deps: PolymarketDeps,
): void {
  const arbConfig = configs.find((c) => c.name === 'cross-market-arb');
  if (arbConfig) {
    const arb = new CrossMarketArbStrategy(
      deps.clobClient,
      deps.scanner,
      arbConfig,
      arbConfig.capitalAllocation,
    );
    runner.register('cross-market-arb', arb);
  }

  const mmConfig = configs.find((c) => c.name === 'market-maker');
  if (mmConfig) {
    const mm = new MarketMakerStrategy(
      deps.clobClient,
      mmConfig,
      mmConfig.capitalAllocation,
    );
    runner.register('market-maker', mm);
  }
}

// ---------------------------------------------------------------------------
// CEX/DEX strategy wiring
// ---------------------------------------------------------------------------

/**
 * Register grid + DCA + funding-rate-arb strategies backed by a CEX client.
 * Config params are cast to their specific shapes — callers must supply valid params.
 */
export function wireCexDexStrategies(
  runner: StrategyRunner,
  configs: StrategyConfig[],
  deps: CexDexDeps,
): void {
  const gridConfig = configs.find((c) => c.name === 'grid-trading');
  if (gridConfig) {
    const grid = new GridTradingStrategy(
      gridConfig.params as unknown as GridConfig,
      deps.exchangeClient,
      gridConfig,
    );
    runner.register('grid-trading', adaptGrid(grid));
  }

  const dcaConfig = configs.find((c) => c.name === 'dca-bot');
  if (dcaConfig) {
    const dcaSymbols = (dcaConfig.params['symbols'] ?? []) as DcaSymbolConfig[];
    const dca = new DcaBotStrategy(dcaSymbols, deps.exchangeClient, dcaConfig);
    runner.register('dca-bot', adaptDca(dca));
  }

  const fundingConfig = configs.find((c) => c.name === 'funding-rate-arb');
  if (fundingConfig) {
    const funding = new FundingRateArbStrategy(
      fundingConfig.params as unknown as FundingArbConfig,
      deps.exchangeClient,
      fundingConfig,
    );
    runner.register('funding-rate-arb', adaptFunding(funding));
  }
}

// ---------------------------------------------------------------------------
// Convenience: wire all strategies
// ---------------------------------------------------------------------------

export interface AllStrategyDeps extends PolymarketDeps, CexDexDeps {}

/**
 * Wire all Polymarket + CEX/DEX strategies in a single call.
 * Only registers strategies present in the provided configs array.
 */
export function wireAllStrategies(
  runner: StrategyRunner,
  configs: StrategyConfig[],
  deps: AllStrategyDeps,
): void {
  wirePolymarketStrategies(runner, configs, deps);
  wireCexDexStrategies(runner, configs, deps);
}
