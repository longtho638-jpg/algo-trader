// src/adapters/GammaClient.ts
import axios from "axios";

// CRITICAL: clobTokenIds, outcomePrices are JSON STRING → must JSON.parse()
export interface ParsedMarket {
  conditionId: string; question: string; slug: string;
  yesTokenId: string; noTokenId: string;
  yesPrice: number; noPrice: number;
  volume: number; liquidity: number;
  endDate: Date; negRisk: boolean;
}

export class GammaClient {
  private base = "https://gamma-api.polymarket.com";

  async getActiveMarkets(limit = 100): Promise<ParsedMarket[]> {
    const r = await axios.get(`${this.base}/markets`, {
      params: { active: true, closed: false, limit, order: "volume24hr", ascending: false },
    });
    return r.data
      .filter((m: any) => m.clobTokenIds && m.clobTokenIds !== "[]")
      .map((m: any) => {
        const t = JSON.parse(m.clobTokenIds) as string[];   // MUST parse!
        const p = JSON.parse(m.outcomePrices) as string[];   // MUST parse!
        return {
          conditionId: m.conditionId, question: m.question, slug: m.slug || "",
          yesTokenId: t[0], noTokenId: t[1],
          yesPrice: parseFloat(p[0]), noPrice: parseFloat(p[1]),
          volume: m.volumeNum, liquidity: m.liquidityNum,
          endDate: new Date(m.endDate), negRisk: m.negRisk ?? false,
        };
      });
  }

  async searchMarkets(query: string): Promise<ParsedMarket[]> {
    const r = await axios.get(`${this.base}/search`, { params: { q: query } });
    return r.data.filter((m: any) => m.clobTokenIds && m.clobTokenIds !== "[]").map((m: any) => {
      const t = JSON.parse(m.clobTokenIds) as string[];
      const p = JSON.parse(m.outcomePrices) as string[];
      return { conditionId: m.conditionId, question: m.question, slug: m.slug || "",
        yesTokenId: t[0], noTokenId: t[1], yesPrice: parseFloat(p[0]), noPrice: parseFloat(p[1]),
        volume: m.volumeNum, liquidity: m.liquidityNum, endDate: new Date(m.endDate), negRisk: m.negRisk ?? false };
    });
  }

  // Find markets "Will X be listed on Binance?"
  async findListingMarkets(): Promise<ParsedMarket[]> {
    return this.searchMarkets("listed Binance");
  }

  // Find markets with high volume (for market making + cross-platform arb)
  async findHighVolumeMarkets(minVol = 50000): Promise<ParsedMarket[]> {
    const r = await axios.get(`${this.base}/markets`, {
      params: { active: true, closed: false, limit: 100, order: "volume24hr", ascending: false, volume_num_min: minVol },
    });
    return r.data.filter((m: any) => m.clobTokenIds && m.clobTokenIds !== "[]").map((m: any) => {
      const t = JSON.parse(m.clobTokenIds) as string[];
      const p = JSON.parse(m.outcomePrices) as string[];
      return { conditionId: m.conditionId, question: m.question, slug: m.slug || "",
        yesTokenId: t[0], noTokenId: t[1], yesPrice: parseFloat(p[0]), noPrice: parseFloat(p[1]),
        volume: m.volumeNum, liquidity: m.liquidityNum, endDate: new Date(m.endDate), negRisk: m.negRisk ?? false };
    });
  }
}
