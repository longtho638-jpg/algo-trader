// src/strategies/CrossPlatformArbStrategy.ts
// Flow: Scan matching markets on Polymarket + Kalshi → if YES(A) + NO(B) < $1.00 → buy both

import { KalshiClient } from "../adapters/KalshiClient";
import { ParsedMarket } from "../adapters/GammaClient";
import { ENV } from "../config/env";
import { kalshiTakerFee, polyTakerFee } from "../config/constants";

export interface ArbOpportunity {
  polyMarket: ParsedMarket;
  kalshiTicker: string;
  polyYesAsk: number;   // cost to buy YES on Polymarket
  kalshiNoAsk: number;  // cost to buy NO on Kalshi
  totalCost: number;    // polyYesAsk + kalshiNoAsk
  grossProfit: number;  // 1.00 - totalCost
  netProfit: number;    // after fees
  contracts: number;
}

// Manual mapping: Polymarket slug patterns → Kalshi ticker patterns
// Build this mapping as you discover matching markets
const MARKET_PAIRS: Array<{ polyQuery: string; kalshiEvent: string }> = [
  { polyQuery: "fed funds rate", kalshiEvent: "FED" },
  { polyQuery: "bitcoin price", kalshiEvent: "KXBTC" },
  { polyQuery: "presidential election", kalshiEvent: "PRES" },
  { polyQuery: "ethereum price", kalshiEvent: "KXETH" },
  // Add more as discovered
];

export class CrossPlatformArbStrategy {
  name = "CrossPlatformArb";
  private kalshi: KalshiClient;

  constructor() {
    this.kalshi = new KalshiClient();
  }

  async init(): Promise<void> {
    // Verify Kalshi connection
    try {
      const bal = await this.kalshi.getBalance();
      console.log(`[CrossArb] Kalshi balance: $${bal}`);
    } catch (e: any) {
      console.error("[CrossArb] Kalshi auth failed:", e.message);
    }
  }

  // Call periodically (every 30-60s)
  async scan(polyMarkets: ParsedMarket[]): Promise<ArbOpportunity[]> {
    const opportunities: ArbOpportunity[] = [];

    for (const pair of MARKET_PAIRS) {
      // Find matching Polymarket market
      const polyMatch = polyMarkets.find(m =>
        m.question.toLowerCase().includes(pair.polyQuery.toLowerCase())
      );
      if (!polyMatch) continue;

      // Find matching Kalshi markets
      try {
        const kalshiMarkets = await this.kalshi.getMarkets({
          event_ticker: pair.kalshiEvent, status: "open",
        });

        for (const km of kalshiMarkets) {
          // Get Kalshi orderbook
          const book = await this.kalshi.getOrderbook(km.ticker, 5);
          if (!book?.no || book.no.length === 0) continue;

          // Kalshi NO ask = lowest ask price on NO side
          // In binary: NO ask = 1.00 - highest YES bid
          // The orderbook returns bids, so:
          const noAsks = book.no.map((l: any) => parseFloat(l[0]));
          const kalshiNoAsk = Math.min(...noAsks);
          if (kalshiNoAsk <= 0) continue;

          // Polymarket YES ask
          const polyYesAsk = polyMatch.yesPrice;

          // Calculate arb
          const totalCost = polyYesAsk + kalshiNoAsk;
          const grossProfit = 1.0 - totalCost;

          if (grossProfit <= 0) continue;

          // Account for fees
          const contracts = 10; // conservative
          const pFee = polyTakerFee(contracts, polyYesAsk); // 0 for most markets
          const kFee = kalshiTakerFee(contracts, kalshiNoAsk);
          const netProfit = grossProfit * contracts - pFee - kFee;

          if (netProfit / (totalCost * contracts) < ENV.MIN_ARB_EDGE) continue;

          opportunities.push({
            polyMarket: polyMatch,
            kalshiTicker: km.ticker,
            polyYesAsk, kalshiNoAsk, totalCost, grossProfit, netProfit, contracts,
          });
        }
      } catch (e: any) {
        console.error(`[CrossArb] Error scanning ${pair.kalshiEvent}:`, e.message);
      }
    }

    return opportunities;
  }

  // Execute both legs simultaneously
  async execute(
    opp: ArbOpportunity,
    polyClient: any, // ClobClient
  ): Promise<{ polySuccess: boolean; kalshiSuccess: boolean }> {
    if (ENV.DRY_RUN) {
      console.log(`[CrossArb] DRY RUN: BUY YES Poly @${opp.polyYesAsk} + BUY NO Kalshi @${opp.kalshiNoAsk} = ${opp.netProfit.toFixed(2)} profit`);
      return { polySuccess: true, kalshiSuccess: true };
    }

    const [polyResult, kalshiResult] = await Promise.allSettled([
      // Polymarket leg: BUY YES
      polyClient.createAndPostMarketOrder(
        { tokenID: opp.polyMarket.yesTokenId, amount: opp.contracts * opp.polyYesAsk,
          side: "BUY", feeRateBps: await polyClient.getFeeRateBps(opp.polyMarket.yesTokenId) },
        { tickSize: await polyClient.getTickSize(opp.polyMarket.yesTokenId), negRisk: opp.polyMarket.negRisk },
        "FOK",
      ),
      // Kalshi leg: BUY NO
      this.kalshi.placeOrder({
        ticker: opp.kalshiTicker, side: "no", action: "buy",
        count: opp.contracts, price: opp.kalshiNoAsk,
        timeInForce: "fill_or_kill",
      }),
    ]);

    return {
      polySuccess: polyResult.status === "fulfilled",
      kalshiSuccess: kalshiResult.status === "fulfilled",
    };
  }

  shutdown(): void {}
}

// CRITICAL: Resolution risk!
// Same event can resolve DIFFERENTLY on Polymarket vs Kalshi due to different wording.
// ALWAYS compare resolution criteria word-by-word before executing.
// Example: "Bitcoin Reserve" resolved YES on Polymarket (any amount) but NO on Kalshi (required SPR-like designation).
