/**
 * Backtest metrics and statistics calculation helpers.
 * Extracted from BacktestEngine to separate pure math from engine orchestration.
 * Computes: Sharpe, Sortino, Calmar, expectancy, equity curve, trade P&L.
 */

import {
  DetailedTrade,
  EquityPoint,
  EngineResult,
} from './backtest-engine-result-types';

export function closeTrade(
  pos: { price: number; time: number; size: number; mae: number; mfe: number },
  exitPrice: number,
  exitTime: number,
  feeRate: number,
): DetailedTrade {
  const entryFee = pos.size * pos.price * feeRate;
  const exitFee = pos.size * exitPrice * feeRate;
  const grossProfit = (exitPrice - pos.price) * pos.size;
  const netProfit = grossProfit - exitFee;

  return {
    entryPrice: pos.price,
    exitPrice,
    entryTime: pos.time,
    exitTime,
    profit: netProfit,
    profitPercent: (netProfit / (pos.price * pos.size)) * 100,
    positionSize: pos.size,
    fees: entryFee + exitFee,
    holdingPeriodMs: exitTime - pos.time,
    maxAdverseExcursion: pos.mae,
    maxFavorableExcursion: pos.mfe,
  };
}

export function applySlippage(price: number, side: 'buy' | 'sell', slippageBps: number): number {
  const mul = slippageBps / 10000;
  return side === 'buy' ? price * (1 + mul) : price * (1 - mul);
}

export function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function buildEngineResult(
  strategyName: string,
  initialBalance: number,
  finalBalance: number,
  maxDrawdown: number,
  trades: DetailedTrade[],
  equityCurve: EquityPoint[],
): EngineResult {
  const wins = trades.filter(t => t.profit > 0);
  const losses = trades.filter(t => t.profit <= 0);
  const totalReturn = ((finalBalance - initialBalance) / initialBalance) * 100;
  const totalFees = trades.reduce((s, t) => s + t.fees, 0);
  const avgProfit = trades.length > 0 ? trades.reduce((s, t) => s + t.profit, 0) / trades.length : 0;

  // Sharpe ratio
  const returns = trades.map(t => t.profitPercent / 100);
  let sharpe = 0;
  if (returns.length >= 2) {
    const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
    const std = Math.sqrt(variance);
    if (std > 0) sharpe = (mean * 252 - 0.05) / (std * Math.sqrt(252));
  }

  // Sortino: only downside deviation
  const negReturns = returns.filter(r => r < 0);
  let sortino = 0;
  if (negReturns.length >= 2) {
    const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
    const downVariance = negReturns.reduce((s, r) => s + r ** 2, 0) / negReturns.length;
    const downDev = Math.sqrt(downVariance);
    if (downDev > 0) sortino = (mean * 252 - 0.05) / (downDev * Math.sqrt(252));
  }

  // Calmar: annual return / max drawdown
  const calmar = maxDrawdown > 0 ? totalReturn / maxDrawdown : 0;

  // Expectancy
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.profit, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.profit, 0)) / losses.length : 0;
  const winRate = trades.length > 0 ? wins.length / trades.length : 0;
  const expectancy = avgWin * winRate - avgLoss * (1 - winRate);

  return {
    strategyName,
    initialBalance,
    finalBalance,
    totalReturn,
    maxDrawdown,
    totalFees,
    totalTrades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: winRate * 100,
    avgProfit,
    sharpeRatio: sharpe,
    equityCurve,
    detailedTrades: trades,
    calmarRatio: calmar,
    sortinoRatio: sortino,
    expectancy,
  };
}

export function emptyEngineResult(name: string, balance: number): EngineResult {
  return {
    strategyName: name, initialBalance: balance, finalBalance: balance,
    totalReturn: 0, maxDrawdown: 0, totalFees: 0, totalTrades: 0,
    wins: 0, losses: 0, winRate: 0, avgProfit: 0, sharpeRatio: 0,
    equityCurve: [], detailedTrades: [], calmarRatio: 0, sortinoRatio: 0, expectancy: 0,
  };
}
