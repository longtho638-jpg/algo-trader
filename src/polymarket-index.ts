// src/polymarket-index.ts
// Entry point for the Polymarket 3-strategy trading bot (spec Section 11)
import { PolymarketBotEngine } from "./core/PolymarketBotEngine";

const bot = new PolymarketBotEngine();
process.on("SIGINT", async () => { await bot.stop(); process.exit(0); });
process.on("SIGTERM", async () => { await bot.stop(); process.exit(0); });
bot.start().catch(e => { console.error("Fatal:", e); process.exit(1); });
