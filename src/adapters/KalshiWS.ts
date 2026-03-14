// src/adapters/KalshiWS.ts
import WebSocket from "ws";
import crypto from "crypto";
import { EventEmitter } from "events";
import { ENV } from "../config/env";

export class KalshiWS extends EventEmitter {
  private ws: WebSocket | null = null;
  private seqNum = 0;

  connect(): void {
    // Auth headers needed at connection time
    const ts = Date.now().toString();
    const msg = ts + "GET" + "/trade-api/ws/v2";
    const sign = crypto.createSign("RSA-SHA256");
    sign.update(msg);
    const sig = sign.sign({
      key: ENV.KALSHI_PEM,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
    }, "base64");

    this.ws = new WebSocket(ENV.KALSHI_WS, {
      headers: {
        "KALSHI-ACCESS-KEY": ENV.KALSHI_KEY_ID,
        "KALSHI-ACCESS-SIGNATURE": sig,
        "KALSHI-ACCESS-TIMESTAMP": ts,
      },
    });

    this.ws.on("open", () => console.log("[KalshiWS] Connected"));
    this.ws.on("message", raw => {
      try { const d = JSON.parse(raw.toString()); this.emit(d.type || d.channel || "data", d); } catch {}
    });
    this.ws.on("close", () => setTimeout(() => this.connect(), 2000));
    this.ws.on("error", e => console.error("[KalshiWS]", e.message));
  }

  subscribeTicker(tickers: string[]): void {
    this.seqNum++;
    this.ws?.send(JSON.stringify({
      id: this.seqNum, cmd: "subscribe",
      params: { channels: ["ticker", "orderbook_delta"], market_tickers: tickers },
    }));
  }

  shutdown(): void { this.ws?.close(); }
}
