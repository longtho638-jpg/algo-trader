export interface TradeRecord {
  entryPrice: number;
  exitPrice: number;
  entryTime: number;
  exitTime: number;
  profit: number;
  profitPercent: number;
  side: 'LONG' | 'SHORT'; // Currently only LONG supported in backtest
}

export interface PerformanceMetrics {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalReturn: number; // Percentage
  sharpeRatio: number;
  maxDrawdown: number;
  profitFactor: number;
  averageWin: number;
  averageLoss: number;
}

export class PerformanceAnalyzer {
  static calculate(trades: TradeRecord[], initialBalance: number, finalBalance: number): PerformanceMetrics {
    const totalTrades = trades.length;
    if (totalTrades === 0) {
      return {
        totalTrades: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        totalReturn: 0,
        sharpeRatio: 0,
        maxDrawdown: 0,
        profitFactor: 0,
        averageWin: 0,
        averageLoss: 0
      };
    }

    const wins = trades.filter(t => t.profit > 0).length;
    const losses = totalTrades - wins;
    const winRate = (wins / totalTrades) * 100;
    const totalReturn = ((finalBalance - initialBalance) / initialBalance) * 100;

    // Calculate Profit Factor
    const grossProfit = trades.filter(t => t.profit > 0).reduce((sum, t) => sum + t.profit, 0);
    const grossLoss = Math.abs(trades.filter(t => t.profit < 0).reduce((sum, t) => sum + t.profit, 0));
    const profitFactor = grossLoss === 0 ? grossProfit : grossProfit / grossLoss;

    // Calculate Averages
    const averageWin = wins > 0 ? grossProfit / wins : 0;
    const averageLoss = losses > 0 ? grossLoss / losses : 0;

    // Calculate Max Drawdown
    // To do this accurately we need the balance curve.
    // We can approximate it by iterating trades if we assume fixed position sizing logic or simulate balance.
    let currentBalance = initialBalance;
    let peakBalance = initialBalance;
    let maxDrawdown = 0;

    const returns: number[] = [];

    trades.forEach(trade => {
      const prevBalance = currentBalance;
      currentBalance += trade.profit;

      if (currentBalance > peakBalance) {
        peakBalance = currentBalance;
      }

      const drawdown = (peakBalance - currentBalance) / peakBalance * 100;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }

      returns.push((currentBalance - prevBalance) / prevBalance);
    });

    // Calculate Sharpe Ratio (assuming risk-free rate = 0 for simplicity)
    const averageReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + Math.pow(b - averageReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    // Annualized Sharpe (assuming daily trades, approx sqrt(252)) - simplified here just raw ratio
    const sharpeRatio = stdDev === 0 ? 0 : averageReturn / stdDev;

    return {
      totalTrades,
      wins,
      losses,
      winRate,
      totalReturn,
      sharpeRatio,
      maxDrawdown,
      profitFactor,
      averageWin,
      averageLoss
    };
  }
}
