// Polymarket market types (spec Section 4)

export interface ParsedMarket {
  conditionId: string;
  question: string;
  slug: string;
  yesTokenId: string;
  noTokenId: string;
  yesPrice: number;
  noPrice: number;
  volume: number;
  liquidity: number;
  endDate: Date;
  negRisk: boolean;
}
