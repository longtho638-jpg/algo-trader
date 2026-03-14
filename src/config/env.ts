import dotenv from "dotenv";
import fs from "fs";
dotenv.config();

function req(k: string): string { const v = process.env[k]; if (!v) throw new Error(`Missing: ${k}`); return v; }
function opt(k: string, d: string): string { return process.env[k] || d; }

export const ENV = {
  // Polymarket
  POLY_HOST: opt("POLYMARKET_HOST", "https://clob.polymarket.com"),
  CHAIN_ID: parseInt(opt("POLYMARKET_CHAIN_ID", "137")),
  PRIVATE_KEY: req("PRIVATE_KEY"),
  POLY_KEY: process.env.POLYMARKET_API_KEY || "",
  POLY_SECRET: process.env.POLYMARKET_API_SECRET || "",
  POLY_PASS: process.env.POLYMARKET_API_PASSPHRASE || "",
  SIG_TYPE: parseInt(opt("POLYMARKET_SIGNATURE_TYPE", "0")),
  FUNDER: process.env.POLYMARKET_FUNDER_ADDRESS,
  // Kalshi
  KALSHI_BASE: opt("KALSHI_API_BASE", "https://api.elections.kalshi.com/trade-api/v2"),
  KALSHI_WS: opt("KALSHI_WS_URL", "wss://api.elections.kalshi.com/trade-api/ws/v2"),
  KALSHI_KEY_ID: process.env.KALSHI_API_KEY_ID || "",
  KALSHI_PEM: process.env.KALSHI_PRIVATE_KEY_PATH
    ? fs.readFileSync(process.env.KALSHI_PRIVATE_KEY_PATH, "utf8") : "",
  // Binance
  BN_API_KEY: process.env.BINANCE_API_KEY || "",
  BN_API_SECRET: process.env.BINANCE_API_SECRET || "",
  // Bot
  DRY_RUN: opt("DRY_RUN", "true") === "true",
  MAX_BANKROLL: parseFloat(opt("MAX_BANKROLL", "5000")),
  MAX_POS_PCT: parseFloat(opt("MAX_POSITION_PCT", "0.06")),
  MIN_ARB_EDGE: parseFloat(opt("MIN_ARB_EDGE", "0.02")),
  MM_SPREAD: parseFloat(opt("MM_SPREAD", "0.10")),
  MM_SIZE: parseFloat(opt("MM_SIZE", "50")),
  MM_MAX_MARKETS: parseInt(opt("MM_MAX_MARKETS", "10")),
  MM_MAX_INVENTORY: parseInt(opt("MM_MAX_INVENTORY", "200")),
  HEARTBEAT_MS: parseInt(opt("HEARTBEAT_MS", "5000")),
  SCAN_MS: parseInt(opt("SCAN_INTERVAL_MS", "60000")),
} as const;
