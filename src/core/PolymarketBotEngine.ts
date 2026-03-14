// src/core/PolymarketBotEngine.ts
// MM-focused Polymarket bot — the only strategy with real edge
// Safety: heartbeat, cancel-on-disconnect, crash recovery, idempotency

import { ClobClient, Side, OrderType } from '@polymarket/clob-client';
import { Wallet } from 'ethers';
import { PolymarketWS } from '../adapters/PolymarketWS';
import { GammaClient, ParsedMarket } from '../adapters/GammaClient';
import { MarketMakerStrategy } from '../strategies/MarketMakerStrategy';
import { RiskManager } from './RiskManager';
import { saveState, loadState, clearState } from './StateManager';
import { LicenseGate } from './LicenseGate';
import { ENV } from '../config/env';

export class PolymarketBotEngine {
  private client!: ClobClient;
  private ws!: PolymarketWS;
  private gamma = new GammaClient();
  private mm = new MarketMakerStrategy();
  private risk = new RiskManager();
  private license = new LicenseGate();
  private markets: ParsedMarket[] = [];
  private running = false;

  // Safety mechanisms
  private heartbeatId = '';
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private processedSignals = new Set<string>();
  private stateInterval: NodeJS.Timeout | null = null;

  async start(): Promise<void> {
    console.log(`=== MM BOT START (${ENV.DRY_RUN ? 'DRY RUN' : 'LIVE'}) === [tier: ${this.license.tier.toUpperCase()}]`);

    // 1. Init Polymarket client
    const wallet = new Wallet(ENV.PRIVATE_KEY);
    if (ENV.POLY_KEY) {
      this.client = new ClobClient(ENV.POLY_HOST, ENV.CHAIN_ID, wallet,
        { key: ENV.POLY_KEY, secret: ENV.POLY_SECRET, passphrase: ENV.POLY_PASS },
        ENV.SIG_TYPE, ENV.FUNDER);
    } else {
      const l1 = new ClobClient(ENV.POLY_HOST, ENV.CHAIN_ID, wallet);
      const c = await l1.createOrDeriveApiKey();
      console.log(`Save these to .env:\nPOLYMARKET_API_KEY=${c.key}\nPOLYMARKET_API_SECRET=${c.secret}\nPOLYMARKET_API_PASSPHRASE=${c.passphrase}`);
      this.client = new ClobClient(ENV.POLY_HOST, ENV.CHAIN_ID, wallet, c, ENV.SIG_TYPE, ENV.FUNDER);
    }

    const bal = await this.client.getBalanceAllowance({ asset_type: 'COLLATERAL' as any });
    console.log(`Balance: $${bal.balance}`);

    // 2. Crash recovery (PRO/ENTERPRISE only)
    if (this.license.canRecover) {
      const prevState = loadState();
      if (prevState) {
        console.log(`[Recovery] Restoring state from ${new Date(prevState.lastSaveTime).toISOString()}`);
        try { await this.client.cancelAll(); } catch {}
        console.log('[Recovery] Cancelled all stale orders');
        this.heartbeatId = prevState.lastHeartbeatId || '';
        prevState.processedSignalKeys.forEach(k => this.processedSignals.add(k));
        clearState();
      }
    } else {
      console.log('[License] Crash recovery skipped (FREE tier)');
    }

    // 3. Init daily loss tracking
    this.risk.initDailyLoss(ENV.MAX_BANKROLL);

    // 4. Scan markets
    await this.scanMarkets();

    // 5. Init MM with selected markets (license enforced inside)
    await this.mm.init(this.markets, this.license);

    // 6. WebSocket
    this.ws = new PolymarketWS({ key: ENV.POLY_KEY, secret: ENV.POLY_SECRET, passphrase: ENV.POLY_PASS });
    this.ws.connectMarket(this.markets.flatMap(m => [m.yesTokenId, m.noTokenId]));
    this.ws.connectUser(this.markets.map(m => m.conditionId));

    // Cancel-all-on-disconnect
    this.ws.onDisconnect(async () => {
      console.warn('[Safety] WS disconnected — cancelling all orders');
      try { await this.client.cancelAll(); } catch {}
    });

    // WS-driven MM requoting (PRO/ENTERPRISE only)
    this.ws.on('best_bid_ask', (d: any) => {
      this.updatePrice(d);
      if (this.license.canWsRequote && this.mm.hasToken(d.asset_id)) {
        this.mm.requote(this.client, d.asset_id).catch(() => {});
      }
    });

    // Fill tracking + license trade counter
    this.ws.on('user:trade', (d: any) => {
      console.log(`[FILL] ${d.side} ${d.size}@${d.price} ${d.status}`);
      this.license.recordTrade();
      if (d.market) {
        this.mm.onFill(d.market, d.side, parseFloat(d.size));
      }
    });

    // 7. Start heartbeat dead-man switch
    this.heartbeatInterval = setInterval(async () => {
      try {
        const resp = await this.client.postHeartbeat(this.heartbeatId);
        this.heartbeatId = (resp as any)?.heartbeat_id || this.heartbeatId;
      } catch (e: any) {
        console.error('[Heartbeat] FAILED:', e.message);
      }
    }, 5000);
    console.log('[Safety] Heartbeat active (5s)');

    // 8. Start loops
    this.running = true;
    this.loopMM();
    this.loopScanAndRotate();

    // 9. State persistence (every 30s, PRO/ENTERPRISE only)
    if (this.license.canRecover) {
      this.stateInterval = setInterval(() => {
        try {
          saveState({
            processedSignalKeys: Array.from(this.processedSignals).slice(-200),
            lastHeartbeatId: this.heartbeatId,
            lastSaveTime: Date.now(),
            inventories: Object.fromEntries(this.mm.getInventories()),
          });
        } catch {}
      }, 30000);
    }

    // 10. Midnight PnL reset
    this.scheduleMidnightReset();

    console.log('=== MM RUNNING ===');
  }

  // MM fallback tick: every 10s (WS requote handles fast updates)
  private async loopMM(): Promise<void> {
    while (this.running) {
      try { await this.mm.tick(this.client); }
      catch (e: any) { console.error('[MM]', e.message); }
      await sleep(10000);
    }
  }

  // Scan new markets + rotate MM selection: every hour
  private async loopScanAndRotate(): Promise<void> {
    while (this.running) {
      await sleep(3600000);
      try {
        await this.scanMarkets();
        await this.mm.refreshMarkets(this.markets, this.client);
        this.ws?.subscribe(this.markets.flatMap(m => [m.yesTokenId, m.noTokenId]));
        console.log(`[Scan] Rotated markets: ${this.markets.length} total`);
      } catch (e: any) {
        console.error('[Scan]', e.message);
      }
    }
  }

  private async scanMarkets(): Promise<void> {
    this.markets = await this.gamma.getActiveMarkets(200);
    console.log(`[Scan] ${this.markets.length} active markets`);
  }

  private updatePrice(d: any): void {
    const m = this.markets.find(m => m.yesTokenId === d.asset_id || m.noTokenId === d.asset_id);
    if (!m) return;
    if (d.asset_id === m.yesTokenId) m.yesPrice = parseFloat(d.best_bid || d.price || '0');
    if (d.asset_id === m.noTokenId) m.noPrice = parseFloat(d.best_bid || d.price || '0');
  }

  private scheduleMidnightReset(): void {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const msUntilMidnight = midnight.getTime() - now.getTime();
    setTimeout(() => {
      this.risk.resetDaily();
      setInterval(() => this.risk.resetDaily(), 86400000);
    }, msUntilMidnight);
  }

  // For dashboard bridge compatibility
  getStatus(): any {
    return {
      running: this.running,
      uptimeMs: 0,
      uptimeHuman: '',
      mode: ENV.DRY_RUN ? 'DRY_RUN' : 'LIVE',
      totalSignals: 0,
      executedTrades: 0,
      rejectedTrades: 0,
      dailyPnL: 0,
      dailyVolume: 0,
      totalPnL: 0,
      strategies: [{ name: 'MarketMaker', enabled: true, signalCount: 0 }],
    };
  }

  on(_event: string, _cb: (...args: any[]) => void): void {
    // Stub for dashboard bridge compatibility
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.stateInterval) clearInterval(this.stateInterval);
    try { await this.mm.shutdown(this.client); } catch {}
    try { await this.client.cancelAll(); } catch {}
    this.ws?.shutdown();
    clearState();
    console.log('=== STOPPED ===');
  }
}

function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }
