// src/arbitrage/index.ts
// Local barrel — replaces @agencyos/trading-core/arbitrage re-exports

export { ArbitrageScanner } from './arbitrage-scanner';
export { ArbitrageExecutor } from './arbitrage-executor';
export { ArbitrageProfitCalculator } from './arbitrage-profit-calculator';
export { ArbitrageRiskManager } from './arbitrage-risk-manager';
export type { ArbitrageConfig } from './arbitrage-config';
export { loadArbitrageConfig, DEFAULT_ARBITRAGE_CONFIG } from './arbitrage-config';
export type { IArbitrageOpportunity } from '../interfaces/IArbitrageOpportunity';

// Re-export advanced engines
export { GraphArbitrageEngine } from './graph-arbitrage-engine';
export { HFTArbitrageEngine } from './hft-arbitrage-engine';
