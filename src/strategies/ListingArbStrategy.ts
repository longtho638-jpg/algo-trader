// src/strategies/ListingArbStrategy.ts
// Flow: Binance announces listing → search Polymarket for matching market → BUY YES at low price

import { BinanceAnnouncementWS } from "../adapters/BinanceAnnouncementWS";
import { BinanceAnnouncementREST } from "../adapters/BinanceAnnouncementREST";
import { GammaClient, ParsedMarket } from "../adapters/GammaClient";
import { ENV } from "../config/env";

export interface Signal {
  tokenId: string; side: "BUY" | "SELL"; price: number;
  size: number; orderType: "GTC" | "FOK";
  edge: number; confidence: number; source: string;
}

export class ListingArbStrategy {
  name = "ListingArb";
  private bnWs = new BinanceAnnouncementWS();
  private bnRest = new BinanceAnnouncementREST();
  private gamma = new GammaClient();
  private listingMarkets: ParsedMarket[] = [];
  private onSignal: (signal: Signal) => void;

  constructor(onSignal: (signal: Signal) => void) {
    this.onSignal = onSignal;
  }

  async init(): Promise<void> {
    // 1. Pre-load listing markets from Polymarket
    await this.refreshListingMarkets();

    // 2. Connect both detection methods
    this.bnWs.on("listing", (data: any) => this.handleListing(data));
    this.bnRest.on("listing", (data: any) => this.handleListing(data));
    this.bnWs.connect();
    this.bnRest.start(5000);

    // 3. Refresh listing markets every 5 minutes
    setInterval(() => this.refreshListingMarkets(), 300000);
    console.log(`[ListingArb] Watching ${this.listingMarkets.length} listing markets`);
  }

  private async refreshListingMarkets(): Promise<void> {
    // Search Polymarket for "listed Binance", "list on Binance", etc.
    const results = await Promise.all([
      this.gamma.searchMarkets("listed Binance"),
      this.gamma.searchMarkets("list on Binance"),
      this.gamma.searchMarkets("Binance listing"),
    ]);
    const all = new Map<string, ParsedMarket>();
    results.flat().forEach(m => all.set(m.conditionId, m));
    this.listingMarkets = Array.from(all.values());
  }

  private handleListing(data: { ticker: string; name: string; title: string }): void {
    console.log(`[ListingArb] DETECTED: ${data.title}`);

    // Match ticker to Polymarket listing market
    const ticker = data.ticker.toLowerCase();
    const name = data.name.toLowerCase();

    const matched = this.listingMarkets.find(m => {
      const q = m.question.toLowerCase();
      return q.includes(ticker) || q.includes(name);
    });

    if (!matched) {
      console.log(`[ListingArb] No matching Polymarket market for ${data.ticker}`);
      return;
    }

    // YES price should be low (market hasn't reacted yet)
    // If YES < 0.80 → BUY YES (listing confirmed = resolves YES at $1.00)
    if (matched.yesPrice >= 0.80) {
      console.log(`[ListingArb] ${data.ticker} — YES already at ${matched.yesPrice}, too late`);
      return;
    }

    const edge = 1.0 - matched.yesPrice; // guaranteed profit per share if resolves YES
    const signal: Signal = {
      tokenId: matched.yesTokenId,
      side: "BUY",
      price: Math.min(matched.yesPrice + 0.05, 0.85), // willing to pay up to 5¢ above current
      size: Math.min(200, Math.floor(ENV.MAX_BANKROLL * ENV.MAX_POS_PCT / matched.yesPrice)),
      orderType: "FOK", // fill immediately or cancel (speed matters!)
      edge,
      confidence: 0.95, // Binance listing is near-certain to resolve YES
      source: this.name,
    };

    console.log(`[ListingArb] SIGNAL: BUY YES ${data.ticker} @ $${signal.price} (edge: ${(edge*100).toFixed(0)}%)`);
    this.onSignal(signal);
  }

  shutdown(): void { this.bnWs.shutdown(); this.bnRest.stop(); }
}
