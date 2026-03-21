// Paper-mode simulators for Polymarket CLOB API responses
// Used by ClobClient when paperMode = true (no real network calls)
import type { RawMarket, RawOrderBook, RawPrice } from './clob-client.js';

const PAPER_MARKET: RawMarket = {
  condition_id: 'paper-condition-1',
  question_id: 'paper-q-1',
  tokens: [
    { token_id: 'paper-yes-1', outcome: 'Yes' },
    { token_id: 'paper-no-1', outcome: 'No' },
  ],
  minimum_order_size: '5',
  minimum_tick_size: '0.01',
  description: '[PAPER] Will BTC exceed $100K by end of 2025?',
  active: true,
  volume: '50000',
};

export function paperMarkets(): RawMarket[] {
  return [PAPER_MARKET];
}

export function paperOrderBook(tokenId: string): RawOrderBook {
  const mid = tokenId.includes('yes') ? 0.6 : 0.4;
  return {
    market: 'paper-market',
    asset_id: tokenId,
    bids: [
      { price: (mid - 0.01).toFixed(2), size: '100' },
      { price: (mid - 0.02).toFixed(2), size: '200' },
    ],
    asks: [
      { price: (mid + 0.01).toFixed(2), size: '100' },
      { price: (mid + 0.02).toFixed(2), size: '200' },
    ],
    hash: 'paper-hash',
  };
}

export function paperPrice(tokenId: string): RawPrice {
  const mid = tokenId.includes('yes') ? 0.6 : 0.4;
  return {
    mid: mid.toFixed(2),
    bid: (mid - 0.01).toFixed(2),
    ask: (mid + 0.01).toFixed(2),
  };
}
