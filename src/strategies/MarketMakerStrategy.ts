// src/strategies/MarketMakerStrategy.ts
// Flow: Post BUY @ (mid - spread/2) and SELL @ (mid + spread/2) → earn spread on fills

import { ClobClient, Side, OrderType } from "@polymarket/clob-client";
import { ParsedMarket } from "../adapters/GammaClient";
import { ENV } from "../config/env";

interface MMState {
  market: ParsedMarket;
  yesInventory: number;
  noInventory: number;
  activeOrderIds: string[];
}

export class MarketMakerStrategy {
  name = "MarketMaker";
  private states: Map<string, MMState> = new Map();
  private cancelThreshold = 0.015; // 1.5% — poly-maker's proven threshold

  async init(markets: ParsedMarket[]): Promise<void> {
    for (const m of markets) {
      this.states.set(m.conditionId, {
        market: m, yesInventory: 0, noInventory: 0, activeOrderIds: [],
      });
    }
    console.log(`[MM] Initialized on ${markets.length} markets`);
  }

  // Call this every sync interval (1-30 seconds)
  async tick(client: ClobClient): Promise<void> {
    for (const [condId, state] of this.states) {
      try {
        await this.quoteMarket(client, state);
      } catch (e: any) {
        console.error(`[MM] Error on ${condId}:`, e.message);
      }
    }
  }

  private async quoteMarket(client: ClobClient, state: MMState): Promise<void> {
    const m = state.market;

    // 1. Get current midpoint
    const midStr = await client.getMidpoint(m.yesTokenId);
    const mid = parseFloat(midStr);
    if (mid <= 0.01 || mid >= 0.99) return; // skip extreme prices

    // 2. Calculate skewed quotes based on inventory
    const { bid, ask } = this.calculateQuotes(mid, state);

    // 3. Get current open orders
    const openOrders = await client.getOpenOrders({ market: m.conditionId } as any);

    // 4. Cancel stale orders (> 1.5% from target)
    const staleIds = openOrders.filter((o: any) => {
      const target = o.side === "BUY" ? bid : ask;
      return Math.abs(parseFloat(o.price) - target) > this.cancelThreshold;
    }).map((o: any) => o.id);

    if (staleIds.length > 0) {
      await client.cancelOrders(staleIds);
      state.activeOrderIds = state.activeOrderIds.filter(id => !staleIds.includes(id));
    }

    // 5. Check if we need new orders
    const hasBid = openOrders.some((o: any) => o.side === "BUY" && Math.abs(parseFloat(o.price) - bid) <= this.cancelThreshold);
    const hasAsk = openOrders.some((o: any) => o.side === "SELL" && Math.abs(parseFloat(o.price) - ask) <= this.cancelThreshold);

    const newOrders: any[] = [];
    const tickSize = await client.getTickSize(m.yesTokenId);
    const negRisk = await client.getNegRisk(m.yesTokenId);
    const feeRate = await client.getFeeRateBps(m.yesTokenId);

    if (!hasBid && bid >= 0.01) {
      const o = await client.createOrder(
        { tokenID: m.yesTokenId, price: bid, size: ENV.MM_SIZE, side: Side.BUY, feeRateBps: feeRate },
        { tickSize: tickSize as any, negRisk }
      );
      newOrders.push({ order: o, orderType: OrderType.GTC, postOnly: true });
    }

    if (!hasAsk && ask <= 0.99) {
      const o = await client.createOrder(
        { tokenID: m.yesTokenId, price: ask, size: ENV.MM_SIZE, side: Side.SELL, feeRateBps: feeRate },
        { tickSize: tickSize as any, negRisk }
      );
      newOrders.push({ order: o, orderType: OrderType.GTC, postOnly: true });
    }

    if (newOrders.length > 0) {
      if (ENV.DRY_RUN) {
        console.log(`[MM] ${m.question.slice(0,40)}... BID:${bid} ASK:${ask} (mid:${mid})`);
      } else {
        const resp = await client.postOrders(newOrders);
        resp.forEach((r: any) => { if (r.orderID) state.activeOrderIds.push(r.orderID); });
      }
    }
  }

  private calculateQuotes(mid: number, state: MMState): { bid: number; ask: number } {
    const halfSpread = ENV.MM_SPREAD / 2;

    // Skew quotes based on inventory to encourage rebalancing
    const total = state.yesInventory + state.noInventory;
    let skew = 0;
    if (total > 0) {
      skew = ((state.yesInventory - state.noInventory) / total) * 0.02; // max 2¢ skew
    }

    return {
      bid: Math.round((mid - halfSpread - skew) * 100) / 100,
      ask: Math.round((mid + halfSpread - skew) * 100) / 100,
    };
  }

  // Call when we detect a fill via user WS
  onFill(conditionId: string, side: "BUY" | "SELL", size: number): void {
    const state = this.states.get(conditionId);
    if (!state) return;
    if (side === "BUY") state.yesInventory += size;
    if (side === "SELL") state.yesInventory -= size;
  }

  async shutdown(client: ClobClient): Promise<void> {
    await client.cancelAll();
    console.log("[MM] All orders cancelled");
  }
}

// MAKER = ZERO fee + daily USDC rebate (100% of taker fees redistributed to makers).
// CRITICAL: Always use postOnly: true.
// If postOnly order crosses spread → 422 error. Handle gracefully.
// Best markets for MM: high volume, wide spread, fee-enabled (for rebate income).
