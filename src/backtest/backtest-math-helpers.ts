// Pure math helpers for backtest metrics: Sharpe ratio, max drawdown, returns
// Kept separate so simulator.ts and report-generator.ts can both import without duplication

/** Convert equity curve to period-over-period returns */
export function equityToReturns(curve: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < curve.length; i++) {
    const prev = curve[i - 1];
    if (prev > 0) returns.push((curve[i] - prev) / prev);
  }
  return returns;
}

/**
 * Annualized Sharpe ratio.
 * Assumes daily candles → annualizes by sqrt(252).
 */
export function calculateSharpeRatio(returns: number[], riskFreeRate = 0.02): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  return ((mean - riskFreeRate / 252) / std) * Math.sqrt(252);
}

/**
 * Maximum drawdown from equity curve as decimal (0.20 = 20%).
 */
export function calculateMaxDrawdown(curve: number[]): number {
  if (curve.length < 2) return 0;
  let peak = curve[0];
  let maxDD = 0;
  for (const eq of curve) {
    if (eq > peak) peak = eq;
    const dd = peak > 0 ? (peak - eq) / peak : 0;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}
