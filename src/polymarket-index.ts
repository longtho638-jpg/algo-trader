// src/polymarket-index.ts
// Entry point for the Polymarket 3-strategy trading bot (spec Section 11)
import { PolymarketBotEngine } from "./polymarket/bot-engine";
import { DashboardBridge } from "./polymarket/dashboard-bridge";

const bot = new PolymarketBotEngine();
const dashboard = new DashboardBridge(bot, parseInt(process.env.WS_DASHBOARD_PORT || "3001"));

async function main() {
  dashboard.start();
  await bot.start();
}

process.on("SIGINT", async () => { await bot.stop(); dashboard.stop(); process.exit(0); });
process.on("SIGTERM", async () => { await bot.stop(); dashboard.stop(); process.exit(0); });
main().catch(e => { console.error("Fatal:", e); process.exit(1); });
