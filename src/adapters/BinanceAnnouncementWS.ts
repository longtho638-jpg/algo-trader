// src/adapters/BinanceAnnouncementWS.ts
// Method A: Official CMS WebSocket (primary — fastest) — spec Section 5.1
import WebSocket from "ws";
import crypto from "crypto";
import { EventEmitter } from "events";
import { ENV } from "../config/env";

export interface ListingAnnouncement {
  id: number;
  title: string;     // "Binance Will List TokenName (TICKER)"
  code: string;      // URL slug
  publishDate: number;
  catalogId: number;  // 48 = new listing
}

export class BinanceAnnouncementWS extends EventEmitter {
  private ws: WebSocket | null = null;

  connect(): void {
    if (!ENV.BN_API_KEY || !ENV.BN_API_SECRET) {
      console.warn("[BinanceWS] No API keys, skipping CMS WebSocket");
      return;
    }

    const random = crypto.randomBytes(16).toString("hex");
    const topic = "com_announcement_en";
    const recvWindow = 30000;
    const timestamp = Date.now();
    const payload = `random=${random}&topic=${topic}&recvWindow=${recvWindow}&timestamp=${timestamp}`;
    const signature = crypto.createHmac("sha256", ENV.BN_API_SECRET).update(payload).digest("hex");
    const url = `wss://api.binance.com/sapi/wss?${payload}&signature=${signature}`;

    this.ws = new WebSocket(url, { headers: { "X-MBX-APIKEY": ENV.BN_API_KEY } });

    this.ws.on("open", () => {
      console.log("[BinanceWS] CMS WebSocket connected");
      setInterval(() => { if (this.ws?.readyState === 1) this.ws.ping(); }, 25000);
    });

    this.ws.on("message", (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "DATA" && msg.topic === "com_announcement_en") {
          const ann = JSON.parse(msg.data);
          if (ann.catalogId === 48) { // catalogId 48 = "New Cryptocurrency Listing"
            const listing = this.parseListing(ann);
            if (listing) this.emit("listing", listing);
          }
        }
      } catch {}
    });

    this.ws.on("close", () => setTimeout(() => this.connect(), 2000));
    this.ws.on("error", e => console.error("[BinanceWS]", e.message));
  }

  private parseListing(ann: any): { ticker: string; name: string; title: string } | null {
    // Parse: "Binance Will List TokenName (TICKER)"
    const match = ann.title?.match(/Binance Will List (.+?) \(([A-Z0-9]+)\)/i);
    if (!match) return null;
    return { name: match[1], ticker: match[2], title: ann.title };
  }

  shutdown(): void { this.ws?.close(); }
}
