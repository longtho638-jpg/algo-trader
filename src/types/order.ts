// Trading signal types (spec Section 7)

export interface Signal {
  tokenId: string;
  side: "BUY" | "SELL";
  price: number;
  size: number;
  orderType: "GTC" | "FOK";
  edge: number;
  confidence: number;
  source: string;
}

export interface ArbOpportunity {
  polyMarket: import("./market").ParsedMarket;
  kalshiTicker: string;
  polyYesPrice: number;
  kalshiNoPrice: number;
  grossProfit: number;
  netProfit: number;
}
