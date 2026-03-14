// src/adapters/KalshiClient.ts
// Spec-aligned: RSA-PSS auth via axios interceptor (Section 6.1)
import axios, { AxiosInstance } from "axios";
import crypto from "crypto";
import { ENV } from "../config/env";

export class KalshiClient {
  private http: AxiosInstance;

  constructor() {
    this.http = axios.create({ baseURL: ENV.KALSHI_BASE, timeout: 10000 });
    this.http.interceptors.request.use(config => {
      const method = (config.method || "GET").toUpperCase();
      const path = (config.url || "").split("?")[0]; // CRITICAL: strip query params
      const ts = Date.now().toString();
      const msg = ts + method + path;

      const sign = crypto.createSign("RSA-SHA256");
      sign.update(msg);
      const sig = sign.sign({
        key: ENV.KALSHI_PEM,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
      }, "base64");

      config.headers["KALSHI-ACCESS-KEY"] = ENV.KALSHI_KEY_ID;
      config.headers["KALSHI-ACCESS-SIGNATURE"] = sig;
      config.headers["KALSHI-ACCESS-TIMESTAMP"] = ts;
      return config;
    });
  }

  // ===== Markets =====
  async getMarkets(params: { limit?: number; event_ticker?: string; status?: string } = {}): Promise<any[]> {
    const r = await this.http.get("/markets", { params: { limit: 100, ...params } });
    return r.data.markets || [];
  }

  async getMarket(ticker: string): Promise<any> {
    const r = await this.http.get(`/markets/${ticker}`);
    return r.data.market;
  }

  async getOrderbook(ticker: string, depth = 10): Promise<any> {
    const r = await this.http.get(`/markets/${ticker}/orderbook`, { params: { depth } });
    return r.data.orderbook;
    // orderbook.yes: [[price, size], ...], orderbook.no: [[price, size], ...]
    // In binary markets: YES_ASK = 1.00 - highest NO BID price
  }

  // ===== Orders =====
  async placeOrder(params: {
    ticker: string;
    side: "yes" | "no";
    action: "buy" | "sell";
    count: number;
    price: number;          // dollars, e.g. 0.50
    timeInForce?: "gtc" | "fill_or_kill";
  }): Promise<any> {
    const r = await this.http.post("/portfolio/orders", {
      ticker: params.ticker,
      side: params.side,
      action: params.action,
      count_fp: params.count.toFixed(2),
      [`${params.side}_price_dollars`]: params.price.toFixed(4),
      client_order_id: crypto.randomUUID(),
      time_in_force: params.timeInForce || "gtc",
      type: "limit",
    });
    return r.data.order;
  }

  async cancelOrder(orderId: string): Promise<void> {
    await this.http.delete(`/portfolio/orders/${orderId}`);
  }

  async getBalance(): Promise<number> {
    const r = await this.http.get("/portfolio/balance");
    return parseFloat(r.data.balance) / 100; // Kalshi returns cents
  }

  async getPositions(): Promise<any[]> {
    const r = await this.http.get("/portfolio/positions");
    return r.data.market_positions || [];
  }
}

// Rate limits: Basic tier = 20 read/s, 10 write/s
// Advanced (apply): 30/30. Premier (≥3.75% vol): 100/100.
// Fee: ceil(0.07 × contracts × price × (1-price)) — max ~1.75¢/contract at 50¢
