// src/strategies/MarketMakerStrategy.ts
// Polymarket Market Maker — the ONLY strategy with real edge
// Fixes: market selection, micro-price, position merge, event-aware eviction, WS-driven requote

import { ClobClient, Side, OrderType } from '@polymarket/clob-client';
import { ParsedMarket } from '../adapters/GammaClient';
import { ENV } from '../config/env';
import { MarketSelector, MarketScore } from './mm/MarketSelector';
import { PositionMerger } from './mm/PositionMerger';

interface MMState {
  market: ParsedMarket;
  yesInventory: number;
  noInventory: number;
  activeOrderIds: string[];
  lastBid: number;
  lastAsk: number;
  lastQuoteTime: number;
  fillCount: number;
  adverseCount: number;
}

export class MarketMakerStrategy {
  name = 'MarketMaker';
  private states: Map<string, MMState> = new Map();
  private selector: MarketSelector;
  private merger: PositionMerger;
  private cancelThreshold = 0.015; // 1.5%
  private readonly maxInventory: number;

  constructor() {
    this.selector = new MarketSelector({
      minDaysToResolution: 2,
      minDailyVolume: 5000,
      minSpread: 0.03,
      maxMarkets: ENV.MM_MAX_MARKETS,
    });
    this.merger = new PositionMerger();
    this.maxInventory = ENV.MM_MAX_INVENTORY;
  }

  async init(markets: ParsedMarket[]): Promise<void> {
    const selected = this.selector.select(markets);
    for (const scored of selected) {
      this.states.set(scored.market.conditionId, {
        market: scored.market,
        yesInventory: 0, noInventory: 0,
        activeOrderIds: [],
        lastBid: 0, lastAsk: 0,
        lastQuoteTime: 0,
        fillCount: 0, adverseCount: 0,
      });
      console.log(`[MM] Selected: ${scored.market.question.slice(0,50)}... (score: ${(scored.score*100).toFixed(0)}, vol:${scored.breakdown.volume} spr:${scored.breakdown.spread} time:${scored.breakdown.time})`);
    }
    console.log(`[MM] ${this.states.size} markets selected from ${markets.length} total`);
  }

  // Full tick: iterate all markets (called every 10s as fallback)
  async tick(client: ClobClient): Promise<void> {
    // 1. Evict markets approaching resolution
    for (const [condId, state] of this.states) {
      if (this.selector.shouldEvict(state.market)) {
        console.log(`[MM] Evicting ${state.market.question.slice(0,40)}... (approaching resolution)`);
        try { await client.cancelMarketOrders({ market: condId, asset_id: state.market.yesTokenId } as any); } catch {}
        this.states.delete(condId);
      }
    }

    // 2. Quote each market
    for (const [condId, state] of this.states) {
      try {
        await this.quoteMarket(client, state);
      } catch (e: any) {
        console.error(`[MM] ${condId.slice(0,8)}...: ${e.message}`);
      }
    }

    // 3. Merge positions if timer elapsed
    if (this.merger.shouldMerge()) {
      const invMap = new Map<string, { yesInventory: number; noInventory: number; yesTokenId: string; noTokenId: string }>();
      for (const [condId, s] of this.states) {
        invMap.set(condId, { yesInventory: s.yesInventory, noInventory: s.noInventory, yesTokenId: s.market.yesTokenId, noTokenId: s.market.noTokenId });
      }
      const pairs = this.merger.findMergeablePositions(invMap);
      if (pairs.length > 0) {
        const freed = await this.merger.executeMerges(client, pairs, ENV.DRY_RUN);
        for (const pair of pairs) {
          const state = this.states.get(pair.conditionId);
          if (state) {
            const merged = Math.min(pair.yesBalance, pair.noBalance);
            state.yesInventory -= merged;
            state.noInventory -= merged;
          }
        }
        if (freed > 0) console.log(`[MM] Merged positions, freed $${freed.toFixed(2)} USDC`);
      }
    }
  }

  // WS-driven requote: called when price moves on a specific market
  async requote(client: ClobClient, tokenId: string): Promise<void> {
    const entry = Array.from(this.states.entries()).find(
      ([_, s]) => s.market.yesTokenId === tokenId || s.market.noTokenId === tokenId
    );
    if (!entry) return;

    const [_, state] = entry;
    // Debounce: don't requote more than once per 2s per market
    if (Date.now() - state.lastQuoteTime < 2000) return;

    try {
      await this.quoteMarket(client, state);
    } catch (e: any) {
      console.error(`[MM] Requote failed: ${e.message}`);
    }
  }

  private async quoteMarket(client: ClobClient, state: MMState): Promise<void> {
    const m = state.market;

    // 1. Get order book for micro-price (NOT midpoint)
    const book = await client.getOrderBook(m.yesTokenId);
    if (!book?.bids?.length || !book?.asks?.length) return;

    const bestBid = parseFloat(book.bids[0].price);
    const bestAsk = parseFloat(book.asks[0].price);
    const bidSize = parseFloat(book.bids[0].size || '1');
    const askSize = parseFloat(book.asks[0].size || '1');

    // Skip extreme prices
    if (bestBid <= 0.02 || bestAsk >= 0.98) return;

    // Micro-price: weighted toward side with more depth
    const microPrice = (bestBid * askSize + bestAsk * bidSize) / (bidSize + askSize);

    // 2. Calculate inventory-skewed quotes
    const { bid, ask } = this.calculateQuotes(microPrice, state);

    // 3. Check if current quotes are still fresh enough
    if (state.lastBid > 0 && state.lastAsk > 0) {
      const bidDrift = Math.abs(bid - state.lastBid);
      const askDrift = Math.abs(ask - state.lastAsk);
      if (bidDrift < this.cancelThreshold && askDrift < this.cancelThreshold) {
        return; // Quotes still fresh
      }
    }

    // 4. Cancel stale orders
    const openOrders = await client.getOpenOrders({ market: m.conditionId } as any);
    const myOrders = openOrders.filter((o: any) =>
      state.activeOrderIds.includes(o.id)
    );

    const staleIds = myOrders.filter((o: any) => {
      const target = o.side === 'BUY' ? bid : ask;
      return Math.abs(parseFloat(o.price) - target) > this.cancelThreshold;
    }).map((o: any) => o.id);

    if (staleIds.length > 0) {
      await client.cancelOrders(staleIds);
      state.activeOrderIds = state.activeOrderIds.filter(id => !staleIds.includes(id));
    }

    // 5. Check if we need new orders
    const hasBid = myOrders.some((o: any) =>
      o.side === 'BUY' && !staleIds.includes(o.id) && Math.abs(parseFloat(o.price) - bid) <= this.cancelThreshold
    );
    const hasAsk = myOrders.some((o: any) =>
      o.side === 'SELL' && !staleIds.includes(o.id) && Math.abs(parseFloat(o.price) - ask) <= this.cancelThreshold
    );

    // 6. Check inventory limits
    const netInventory = state.yesInventory - state.noInventory;
    const shouldBid = !hasBid && bid >= 0.02 && netInventory < this.maxInventory;
    const shouldAsk = !hasAsk && ask <= 0.98 && netInventory > -this.maxInventory;

    const newOrders: any[] = [];
    const tickSize = await client.getTickSize(m.yesTokenId);
    const negRisk = await client.getNegRisk(m.yesTokenId);
    const feeRate = await client.getFeeRateBps(m.yesTokenId);

    if (shouldBid) {
      const o = await client.createOrder(
        { tokenID: m.yesTokenId, price: bid, size: ENV.MM_SIZE, side: Side.BUY, feeRateBps: feeRate },
        { tickSize: tickSize as any, negRisk }
      );
      newOrders.push({ order: o, orderType: OrderType.GTC, postOnly: true });
    }

    if (shouldAsk) {
      const o = await client.createOrder(
        { tokenID: m.yesTokenId, price: ask, size: ENV.MM_SIZE, side: Side.SELL, feeRateBps: feeRate },
        { tickSize: tickSize as any, negRisk }
      );
      newOrders.push({ order: o, orderType: OrderType.GTC, postOnly: true });
    }

    if (newOrders.length > 0) {
      if (ENV.DRY_RUN) {
        console.log(`[MM] ${m.question.slice(0,35)}... BID:${bid.toFixed(2)} ASK:${ask.toFixed(2)} (µ:${microPrice.toFixed(3)} inv:${netInventory})`);
      } else {
        try {
          const resp = await client.postOrders(newOrders);
          resp.forEach((r: any) => { if (r.orderID) state.activeOrderIds.push(r.orderID); });
        } catch (e: any) {
          // 422 = postOnly crossed spread. Expected, not error.
          if (e.status === 422 || e.response?.status === 422) {
            // Normal: our quote crossed the spread, skip silently
          } else {
            throw e;
          }
        }
      }
    }

    state.lastBid = bid;
    state.lastAsk = ask;
    state.lastQuoteTime = Date.now();
  }

  private calculateQuotes(fairPrice: number, state: MMState): { bid: number; ask: number } {
    const halfSpread = ENV.MM_SPREAD / 2;

    // Inventory skew: push quotes away from accumulated side
    const netInventory = state.yesInventory - state.noInventory;
    const skewPerShare = 0.0001; // 0.01¢ per share of inventory imbalance
    const skew = netInventory * skewPerShare;
    const cappedSkew = Math.max(-halfSpread * 0.5, Math.min(halfSpread * 0.5, skew));

    const rawBid = fairPrice - halfSpread - cappedSkew;
    const rawAsk = fairPrice + halfSpread - cappedSkew;

    return {
      bid: Math.round(Math.max(0.01, rawBid) * 100) / 100,
      ask: Math.round(Math.min(0.99, rawAsk) * 100) / 100,
    };
  }

  // Called by BotEngine when WS reports a fill
  onFill(conditionId: string, side: 'BUY' | 'SELL', size: number): void {
    const state = this.states.get(conditionId);
    if (!state) return;
    if (side === 'BUY') state.yesInventory += size;
    if (side === 'SELL') state.yesInventory -= size;
    state.fillCount++;
  }

  // Get state for specific token (for WS-driven requote lookup)
  hasToken(tokenId: string): boolean {
    return Array.from(this.states.values()).some(
      s => s.market.yesTokenId === tokenId || s.market.noTokenId === tokenId
    );
  }

  // Get all inventories for position merger
  getInventories(): Map<string, { yesInventory: number; noInventory: number; yesTokenId: string; noTokenId: string }> {
    const map = new Map();
    for (const [condId, s] of this.states) {
      map.set(condId, { yesInventory: s.yesInventory, noInventory: s.noInventory, yesTokenId: s.market.yesTokenId, noTokenId: s.market.noTokenId });
    }
    return map;
  }

  // Re-select markets (called hourly)
  async refreshMarkets(allMarkets: ParsedMarket[], client: ClobClient): Promise<void> {
    const newSelected = this.selector.select(allMarkets);
    const newIds = new Set(newSelected.map(s => s.market.conditionId));
    const currentIds = new Set(this.states.keys());

    // Remove markets no longer selected
    for (const condId of currentIds) {
      if (!newIds.has(condId)) {
        try { await client.cancelMarketOrders({ market: condId } as any); } catch {}
        console.log(`[MM] Removed: ${this.states.get(condId)?.market.question.slice(0,40)}...`);
        this.states.delete(condId);
      }
    }

    // Add new markets
    for (const scored of newSelected) {
      if (!currentIds.has(scored.market.conditionId)) {
        this.states.set(scored.market.conditionId, {
          market: scored.market,
          yesInventory: 0, noInventory: 0,
          activeOrderIds: [],
          lastBid: 0, lastAsk: 0,
          lastQuoteTime: 0,
          fillCount: 0, adverseCount: 0,
        });
        console.log(`[MM] Added: ${scored.market.question.slice(0,40)}... (score: ${(scored.score*100).toFixed(0)})`);
      }
    }
  }

  async shutdown(client: ClobClient): Promise<void> {
    await client.cancelAll();
    console.log('[MM] All orders cancelled');
    for (const [_, state] of this.states) {
      if (state.fillCount > 0) {
        console.log(`[MM] ${state.market.question.slice(0,35)}... fills:${state.fillCount} inv:${state.yesInventory - state.noInventory}`);
      }
    }
  }
}

// Type exports for compatibility with polymarket/index.ts
export interface MMConfig {
  spread: number;
  size: number;
  maxMarkets: number;
  maxInventory: number;
}

export interface MMPosition {
  conditionId: string;
  yesInventory: number;
  noInventory: number;
  netInventory: number;
}

export interface MMOrder {
  orderId: string;
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
}

// MAKER = ZERO fee + daily USDC rebate (100% of taker fees redistributed to makers).
// CRITICAL: Always use postOnly: true.
// If postOnly order crosses spread → 422 error. Handle gracefully.
