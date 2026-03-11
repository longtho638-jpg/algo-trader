# Phase 1B: Paper Trading Engine

## Overview
Virtual balance engine for simulated trading without real exchange orders.
Plugs into BotEngine as an IExchange implementation.

## Requirements
- Virtual balance tracking (initial deposit configurable)
- Simulated order fills (market orders at current price + slippage)
- Position tracking (open/closed)
- P&L calculation (realized + unrealized)
- Trade history log

## Files to Create
- `src/core/paper-trading-engine.ts` (max 150 lines)
- `src/core/paper-trading-engine.test.ts` (max 120 lines)

## Architecture
```
BotEngine → PaperTradingEngine (implements IExchange-like interface)
  buy(pair, amount)  → deduct quote, add base, log trade
  sell(pair, amount) → deduct base, add quote, log trade
  getBalance()       → return virtual balances
  getPositions()     → return open positions
  getPnl()           → realized + unrealized P&L
  getTradeHistory()  → array of executed trades
```

## Key Types
```ts
interface PaperTrade {
  id: string;
  pair: string;
  side: 'buy' | 'sell';
  amount: number;
  price: number;
  fee: number;
  timestamp: number;
}

interface PaperPosition {
  pair: string;
  side: 'long' | 'short';
  entryPrice: number;
  amount: number;
  unrealizedPnl: number;
}
```

## Implementation
- Map-based balance tracker (currency → amount)
- Configurable slippage (default 0.1%)
- Configurable fee rate (default 0.1%)
- Trade ID via counter (no uuid dependency)
- Reset method for fresh start

## Success Criteria
- [x] Buy/sell correctly updates balances
- [x] P&L calculation accurate
- [x] Slippage + fees applied
- [x] Tests cover edge cases (insufficient balance, zero amount)
- [x] TypeScript strict, 0 errors

## Status: COMPLETE (260301-2223)
- 21/21 tests pass
- 0 TypeScript errors
- Files: src/core/paper-trading-engine.ts (148 lines), src/core/paper-trading-engine.test.ts (120 lines)
