/**
 * Gamma Markets API Client — type definitions for strategy consumption.
 */

export interface GammaMarket {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  outcomes: string[];
  outcomePrices: string[];
  volume: number;
  liquidity: number;
  endDate: string;
  active: boolean;
  closed: boolean;
  groupItemTitle?: string;
  tokens: Array<{ token_id: string; outcome: string; price: number }>;
}

export interface GammaMarketGroup {
  id: string;
  title: string;
  slug: string;
  markets: GammaMarket[];
}

export interface GammaClient {
  getMarkets(params?: { limit?: number; active?: boolean }): Promise<GammaMarket[]>;
  getMarket(conditionId: string): Promise<GammaMarket | null>;
  getMarketGroup(groupId: string): Promise<GammaMarketGroup | null>;
  searchMarkets(query: string): Promise<GammaMarket[]>;
}
