// src/adapters/BinanceAnnouncementREST.ts
import axios from "axios";
import crypto from "crypto";
import { EventEmitter } from "events";

export class BinanceAnnouncementREST extends EventEmitter {
  private lastSeenId = 0;
  private interval: NodeJS.Timeout | null = null;

  start(pollMs = 5000): void {
    this.poll(); // initial
    this.interval = setInterval(() => this.poll(), pollMs);
  }

  private async poll(): Promise<void> {
    try {
      const resp = await axios.get(
        "https://www.binance.com/bapi/composite/v1/public/cms/article/catalog/list/query",
        {
          params: { catalogId: 48, pageNo: 1, pageSize: 5 },
          headers: {
            "clienttype": "web",
            "content-type": "application/json",
            "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "lang": "en",
            "bnc-uuid": crypto.randomUUID(),
          },
          timeout: 5000,
        },
      );

      const articles = resp.data?.data?.articles || [];
      for (const art of articles) {
        if (art.id > this.lastSeenId) {
          if (this.lastSeenId > 0) { // skip first run
            const match = art.title?.match(/Binance Will List (.+?) \(([A-Z0-9]+)\)/i);
            if (match) {
              this.emit("listing", { name: match[1], ticker: match[2], title: art.title });
            }
          }
          this.lastSeenId = Math.max(this.lastSeenId, art.id);
        }
      }
    } catch (e: any) {
      // 403 = Cloudflare block. Need proxy rotation for aggressive polling.
      if (e.response?.status === 403) console.warn("[BinanceREST] Cloudflare 403 — reduce poll rate or add proxy");
    }
  }

  stop(): void { if (this.interval) clearInterval(this.interval); }
}
