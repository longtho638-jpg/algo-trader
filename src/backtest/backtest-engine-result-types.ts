/**
 * BacktestEngine result and analysis types.
 * Extracted from BacktestEngine to keep type definitions separate from engine logic.
 * Includes: EquityPoint, DetailedTrade, WalkForwardWindow, WalkForwardResult,
 *           MonteCarloResult, EngineResult.
 */

import { BacktestResult } from './BacktestRunner';

export interface EquityPoint {
  timestamp: number;
  equity: number;
  drawdown: number; // Current drawdown %
}

export interface DetailedTrade {
  entryPrice: number;
  exitPrice: number;
  entryTime: number;
  exitTime: number;
  profit: number;
  profitPercent: number;
  positionSize: number;
  fees: number;
  holdingPeriodMs: number;
  maxAdverseExcursion: number; // Worst price during trade
  maxFavorableExcursion: number; // Best price during trade
}

export interface WalkForwardWindow {
  trainStart: number;
  trainEnd: number;
  testStart: number;
  testEnd: number;
  trainResult: BacktestResult;
  testResult: BacktestResult;
}

export interface WalkForwardResult {
  windows: WalkForwardWindow[];
  aggregateTestReturn: number;
  aggregateTestSharpe: number;
  robustnessRatio: number; // test_sharpe / train_sharpe — closer to 1 = more robust
  overfit: boolean; // true if test performance degrades >50% vs train
}

export interface MonteCarloResult {
  medianReturn: number;
  p5Return: number;    // 5th percentile (worst case)
  p95Return: number;   // 95th percentile (best case)
  medianDrawdown: number;
  p95Drawdown: number; // 95th percentile worst drawdown
  ruinProbability: number; // % of simulations that lost >50%
}

export interface EngineResult extends BacktestResult {
  equityCurve: EquityPoint[];
  detailedTrades: DetailedTrade[];
  calmarRatio: number;    // Annual return / max drawdown
  sortinoRatio: number;   // Return / downside deviation
  expectancy: number;     // Avg win * win_rate - avg loss * loss_rate
}
