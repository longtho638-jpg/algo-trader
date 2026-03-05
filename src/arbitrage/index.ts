/**
 * Arbitrage barrel — re-exports all primitives from @agencyos/trading-core.
 * Package is the single source of truth for cross-exchange arb logic.
 * App-specific wiring (ExchangeClient factory) lives in CLI commands.
 */
export * from '@agencyos/trading-core/arbitrage';
