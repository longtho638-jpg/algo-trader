// src/core/PolymarketBotEngine.ts
// Spec Section 11: Polymarket-specific BotEngine with all 3 strategies
import { ClobClient, Side, OrderType } from "@polymarket/clob-client";
import { Wallet } from "ethers";
import { PolymarketWS } from "../adapters/PolymarketWS";
import { GammaClient, ParsedMarket } from "../adapters/GammaClient";
import { ListingArbStrategy, Signal } from "../strategies/ListingArbStrategy";
import { CrossPlatformArbStrategy } from "../strategies/CrossPlatformArbStrategy";
import { MarketMakerStrategy } from "../strategies/MarketMakerStrategy";
import { RiskManager } from "./RiskManager";
import { ENV } from "../config/env";

export class PolymarketBotEngine {
  private client!: ClobClient;
  private ws!: PolymarketWS;
  private gamma = new GammaClient();
  private listingArb!: ListingArbStrategy;
  private crossArb = new CrossPlatformArbStrategy();
  private mm = new MarketMakerStrategy();
  private risk = new RiskManager();
  private markets: ParsedMarket[] = [];
  private running = false;

  async start(): Promise<void> {
    console.log(`=== BOT START (${ENV.DRY_RUN ? "DRY RUN" : "LIVE"}) ===`);

    // 1. Init Polymarket client
    const wallet = new Wallet(ENV.PRIVATE_KEY);
    if (ENV.POLY_KEY) {
      this.client = new ClobClient(ENV.POLY_HOST, ENV.CHAIN_ID, wallet,
        { key: ENV.POLY_KEY, secret: ENV.POLY_SECRET, passphrase: ENV.POLY_PASS },
        ENV.SIG_TYPE, ENV.FUNDER);
    } else {
      const l1 = new ClobClient(ENV.POLY_HOST, ENV.CHAIN_ID, wallet);
      const c = await l1.createOrDeriveApiKey();
      console.log(`POLYMARKET_API_KEY=${c.key}\nPOLYMARKET_API_SECRET=${c.secret}\nPOLYMARKET_API_PASSPHRASE=${c.passphrase}`);
      this.client = new ClobClient(ENV.POLY_HOST, ENV.CHAIN_ID, wallet, c, ENV.SIG_TYPE, ENV.FUNDER);
    }

    const bal = await this.client.getBalanceAllowance({ asset_type: "COLLATERAL" as any });
    console.log(`Polymarket balance: $${bal.balance}`);

    // Init daily loss tracking
    this.risk.initDailyLoss(ENV.MAX_BANKROLL);

    // 2. Scan markets
    await this.scanMarkets();

    // 3. Init strategies
    this.listingArb = new ListingArbStrategy(sig => this.executeSignal(sig));
    await this.listingArb.init();
    await this.crossArb.init();
    await this.mm.init(this.markets.filter(m => m.liquidity > 10000)); // MM on liquid markets only

    // 4. WebSocket
    this.ws = new PolymarketWS({ key: ENV.POLY_KEY, secret: ENV.POLY_SECRET, passphrase: ENV.POLY_PASS });
    this.ws.connectMarket(this.markets.flatMap(m => [m.yesTokenId, m.noTokenId]));
    this.ws.connectUser(this.markets.map(m => m.conditionId));
    this.ws.on("best_bid_ask", (d: any) => this.updatePrice(d));
    this.ws.on("user:trade", (d: any) => {
      console.log(`[FILL] ${d.side} ${d.size}@${d.price} ${d.status}`);
      this.mm.onFill(d.market, d.side, parseFloat(d.size));
    });

    // 5. Loops
    this.running = true;
    this.loopCrossArb();
    this.loopMM();
    this.loopScan();

    // Reset daily PnL at midnight
    this.scheduleMidnightReset();

    console.log("=== RUNNING ===");
  }

  // CrossArb: scan every 30s
  private async loopCrossArb(): Promise<void> {
    while (this.running) {
      try {
        const opps = await this.crossArb.scan(this.markets);
        for (const opp of opps) {
          console.log(`[CrossArb] ${opp.polyMarket.question.slice(0,40)}... profit=$${opp.netProfit.toFixed(3)}`);
          if (!ENV.DRY_RUN) await this.crossArb.execute(opp, this.client);
        }
      } catch (e: any) { console.error("[CrossArb]", e.message); }
      await sleep(30000);
    }
  }

  // MarketMaker: tick every 10s
  private async loopMM(): Promise<void> {
    while (this.running) {
      try { await this.mm.tick(this.client); }
      catch (e: any) { console.error("[MM]", e.message); }
      await sleep(10000);
    }
  }

  // Market scan: every 5 minutes
  private async loopScan(): Promise<void> {
    while (this.running) {
      await sleep(ENV.SCAN_MS);
      try { await this.scanMarkets(); } catch (e: any) { console.error("[Scan]", e.message); }
    }
  }

  private async scanMarkets(): Promise<void> {
    this.markets = await this.gamma.getActiveMarkets(200);
    console.log(`[Scan] ${this.markets.length} markets`);
    this.ws?.subscribe(this.markets.flatMap(m => [m.yesTokenId, m.noTokenId]));
  }

  private async executeSignal(signal: Signal): Promise<void> {
    const bal = await this.client.getBalanceAllowance({ asset_type: "COLLATERAL" as any });
    const v = this.risk.validate(signal, parseFloat(bal.balance));
    if (!v) return;

    console.log(`[TRADE] ${v.source}: ${v.side} ${v.size}@$${v.price} edge=${(v.edge*100).toFixed(0)}%`);
    if (ENV.DRY_RUN) return;

    const ts = await this.client.getTickSize(v.tokenId);
    const nr = await this.client.getNegRisk(v.tokenId);
    const fr = await this.client.getFeeRateBps(v.tokenId);

    if (v.orderType === "FOK") {
      await this.client.createAndPostMarketOrder(
        { tokenID: v.tokenId, amount: v.size * v.price, side: Side.BUY, feeRateBps: fr },
        { tickSize: ts as any, negRisk: nr }, OrderType.FOK
      );
    } else {
      await this.client.createAndPostOrder(
        { tokenID: v.tokenId, price: v.price, size: v.size, side: Side.BUY, feeRateBps: fr },
        { tickSize: ts as any, negRisk: nr }, OrderType.GTC
      );
    }
  }

  private updatePrice(d: any): void {
    const m = this.markets.find(m => m.yesTokenId === d.asset_id || m.noTokenId === d.asset_id);
    if (!m) return;
    if (d.asset_id === m.yesTokenId) m.yesPrice = parseFloat(d.best_bid);
    if (d.asset_id === m.noTokenId) m.noPrice = parseFloat(d.best_bid);
  }

  private scheduleMidnightReset(): void {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const msUntilMidnight = midnight.getTime() - now.getTime();
    setTimeout(() => {
      this.risk.resetDaily();
      setInterval(() => this.risk.resetDaily(), 86400000); // every 24h
    }, msUntilMidnight);
  }

  async stop(): Promise<void> {
    this.running = false;
    try { await this.mm.shutdown(this.client); } catch {}
    try { await this.client.cancelAll(); } catch {}
    this.ws?.shutdown();
    this.listingArb.shutdown();
    console.log("=== STOPPED ===");
  }
}

function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }
