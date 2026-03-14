// WebSocket event types for Polymarket + Kalshi

export interface BookEvent {
  event_type: "book";
  asset_id: string;
  market: string;
  bids: Array<{ price: string; size: string }>;
  asks: Array<{ price: string; size: string }>;
  timestamp: string;
  hash: string;
}

export interface PriceChangeEvent {
  event_type: "price_change";
  asset_id: string;
  market: string;
  price: string;
  side: "buy" | "sell";
  size: string;
  timestamp: string;
}

export interface BestBidAskEvent {
  event_type: "last_trade_price" | "price_change";
  asset_id: string;
  market: string;
  best_bid: string;
  best_ask: string;
  last_trade_price: string;
  timestamp: string;
}

export interface UserTradeEvent {
  event_type: "trade";
  asset_id: string;
  market: string;
  side: "BUY" | "SELL";
  price: string;
  size: string;
  fee_rate_bps: string;
  timestamp: string;
}

export interface UserOrderEvent {
  event_type: "order";
  asset_id: string;
  market: string;
  order_id: string;
  side: "BUY" | "SELL";
  price: string;
  original_size: string;
  size_matched: string;
  status: "matched" | "open" | "canceled";
  timestamp: string;
}
