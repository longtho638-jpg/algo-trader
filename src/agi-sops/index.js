/**
 * AGI SOPs Integration for AlgoTrader
 * Execute trading SOPs using local LLM
 */

import Orchestrator from './orchestrator.js';
import { registerAction } from './actions/registry.js';

// Register AlgoTrader-specific actions
registerAction('trading:scan', async (params) => {
  const { pairs = ['BTC/USDT'], exchanges = ['binance'] } = params;
  return { opportunities: [], scanned: pairs };
});

registerAction('trading:execute', async (params) => {
  const { symbol, side, amount } = params;
  return { orderId: `mock-${Date.now()}`, status: 'pending' };
});

registerAction('trading:risk-check', async (params) => {
  const { position, portfolio } = params;
  return { approved: true, riskLevel: 'low' };
});

registerAction('backtest:run', async (params) => {
  const { strategy, timeframe, days } = params;
  return { result: { totalReturn: 0.15, sharpe: 1.2 } };
});

const orchestrator = new Orchestrator({
  model: process.env.AGI_MODEL || 'llama3.2',
  host: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434'
});

export { orchestrator };
export default orchestrator;
