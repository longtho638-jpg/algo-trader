// src/adapters/PolymarketWS.ts
import WebSocket from "ws";
import { EventEmitter } from "events";

export class PolymarketWS extends EventEmitter {
  private mws: WebSocket | null = null;
  private uws: WebSocket | null = null;
  private pings: NodeJS.Timeout[] = [];
  private tokens = new Set<string>();

  constructor(private creds: { key: string; secret: string; passphrase: string }) { super(); }

  connectMarket(tokenIds: string[]): void {
    tokenIds.forEach(id => this.tokens.add(id));
    this.mws = new WebSocket("wss://ws-subscriptions-clob.polymarket.com/ws/market");
    this.mws.on("open", () => {
      this.mws!.send(JSON.stringify({
        assets_ids: Array.from(this.tokens), type: "market", custom_feature_enabled: true,
      }));
      this.pings.push(setInterval(() => { if (this.mws?.readyState === 1) this.mws.send("PING"); }, 5000));
    });
    this.mws.on("message", r => { const m = r.toString(); if (m==="PONG") return; try { const d=JSON.parse(m); this.emit(d.event_type,d); } catch{} });
    this.mws.on("close", () => setTimeout(() => this.connectMarket(Array.from(this.tokens)), 2000));
    this.mws.on("error", e => this.emit("error", e));
  }

  connectUser(conditionIds: string[]): void {
    this.uws = new WebSocket("wss://ws-subscriptions-clob.polymarket.com/ws/user");
    this.uws.on("open", () => {
      this.uws!.send(JSON.stringify({ auth: this.creds, markets: conditionIds, type: "user" }));
      this.pings.push(setInterval(() => { if (this.uws?.readyState === 1) this.uws.send("PING"); }, 5000));
    });
    this.uws.on("message", r => { const m=r.toString(); if(m==="PONG") return; try { const d=JSON.parse(m); this.emit(`user:${d.event_type}`,d); } catch{} });
    this.uws.on("close", () => setTimeout(() => this.connectUser(conditionIds), 2000));
  }

  subscribe(tokenIds: string[]): void {
    tokenIds.forEach(id => this.tokens.add(id));
    if (this.mws?.readyState === 1)
      this.mws.send(JSON.stringify({ assets_ids: tokenIds, operation: "subscribe", custom_feature_enabled: true }));
  }

  shutdown(): void { this.pings.forEach(clearInterval); this.mws?.close(); this.uws?.close(); }
}

// Events: "book", "price_change", "last_trade_price", "best_bid_ask", "tick_size_change", "new_market", "market_resolved"
// User events: "user:trade" (MATCHED→CONFIRMED), "user:order" (PLACEMENT/UPDATE/CANCELLATION)
// CRITICAL: assets_ids = TOKEN IDs. markets (user channel) = CONDITION IDs.
// CRITICAL: Send "PING" text mỗi 5s. Không gửi = disconnect.
