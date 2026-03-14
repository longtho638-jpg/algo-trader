// src/polymarket/dashboard-bridge.ts
// Bridge PolymarketBotEngine events → Dashboard WebSocket
import { WebSocketServer, WebSocket } from "ws";
import { PolymarketBotEngine } from "./bot-engine";

export class DashboardBridge {
  private wss: WebSocketServer | null = null;
  private clients = new Set<WebSocket>();
  private statusInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private engine: PolymarketBotEngine, private port = 3001) {}

  start(): void {
    this.wss = new WebSocketServer({ port: this.port });
    console.log(`[Dashboard] WS bridge on port ${this.port}`);

    this.wss.on("connection", (ws) => {
      this.clients.add(ws);
      ws.on("close", () => this.clients.delete(ws));

      // Send snapshot on connect
      this.sendSnapshot(ws);
    });

    // Bridge engine events
    this.engine.on("trade:executed", (order: any) => {
      this.broadcast({
        type: "trade_executed",
        trade: {
          id: order.id || Date.now().toString(),
          timestamp: Date.now(),
          strategy: order.strategy || "unknown",
          side: order.side,
          symbol: order.tokenId || order.symbol || "PM",
          price: order.price || 0,
          size: order.size || 0,
          pnl: 0,
          dryRun: false,
        },
      });
    });

    this.engine.on("signal:executed", (data: any) => {
      this.broadcast({
        type: "trade_executed",
        trade: {
          id: Date.now().toString(),
          timestamp: Date.now(),
          strategy: data.signal?.strategy || "unknown",
          side: data.signal?.side || "BUY",
          symbol: data.signal?.tokenId || "PM",
          price: data.trade?.price || data.signal?.price || 0,
          size: data.trade?.size || data.signal?.size || 0,
          pnl: 0,
          dryRun: data.dryRun ?? true,
        },
      });
    });

    this.engine.on("started", () => this.broadcastBotStatus());
    this.engine.on("stopped", () => this.broadcastBotStatus());

    // Periodic status broadcast every 5s
    this.statusInterval = setInterval(() => this.broadcastBotStatus(), 5000);
  }

  private sendSnapshot(ws: WebSocket): void {
    const s = this.engine.getStatus();
    this.send(ws, {
      type: "snapshot",
      botStatus: this.toBotStatus(s),
      strategies: this.toStrategies(s),
      positions: [],
      trades: [],
    });
  }

  private broadcastBotStatus(): void {
    const s = this.engine.getStatus();
    this.broadcast({ type: "bot_status", status: this.toBotStatus(s) });
    this.broadcast({ type: "strategy_status", strategies: this.toStrategies(s) });
  }

  private toBotStatus(s: ReturnType<PolymarketBotEngine["getStatus"]>) {
    return {
      running: s.running,
      mode: s.mode === "DRY_RUN" ? "dry-run" as const : "live" as const,
      uptime: s.uptimeMs,
      totalSignals: s.totalSignals,
      executedTrades: s.executedTrades,
      rejectedTrades: s.rejectedTrades,
      dailyPnl: s.dailyPnL,
    };
  }

  private toStrategies(s: ReturnType<PolymarketBotEngine["getStatus"]>) {
    return s.strategies.map((st) => ({
      name: st.name,
      enabled: st.enabled,
      signalCount: st.signalCount,
      lastSignalAt: null,
      mode: s.mode === "DRY_RUN" ? "dry-run" as const : "live" as const,
    }));
  }

  private broadcast(data: unknown): void {
    const msg = JSON.stringify(data);
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    }
  }

  private send(ws: WebSocket, data: unknown): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
  }

  stop(): void {
    if (this.statusInterval) clearInterval(this.statusInterval);
    this.wss?.close();
  }
}
