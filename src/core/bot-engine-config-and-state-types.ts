/**
 * BotEngine configuration interface and internal position state types.
 * Extracted from BotEngine to keep the engine class focused on orchestration.
 */

import { StopLossTakeProfitConfig } from './RiskManager';
import { AutonomyLevel } from '../a2ui';

export interface BotConfig {
  tenantId: string; // Multi-tenant isolation
  symbol: string;
  riskPercentage: number;
  pollInterval: number; // ms
  maxDrawdownPercent?: number; // Optional: stop bot when drawdown exceeds this % (e.g. 10 = 10%)
  minPositionValueUsd?: number; // Minimum USD value to consider position open (default: 10)
  feeRate?: number; // Trading fee rate per side (default: 0.001 = 0.1%)
  stopLoss?: StopLossTakeProfitConfig; // Hard stop-loss + take-profit config
  autonomyLevel?: AutonomyLevel; // A2UI autonomy dial (default: ACT_CONFIRM)
}

/** Mutable position state shared between BotEngine and BotTradeExecutor */
export interface BotPositionState {
  openPosition: boolean;
  peakBalance: number;
  entryPrice: number;
}
