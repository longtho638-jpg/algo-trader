// ===== Polymarket =====
export const POLY_CLOB = "https://clob.polymarket.com";
export const POLY_GAMMA = "https://gamma-api.polymarket.com";
export const POLY_WS_MARKET = "wss://ws-subscriptions-clob.polymarket.com/ws/market";
export const POLY_WS_USER = "wss://ws-subscriptions-clob.polymarket.com/ws/user";

// ===== Kalshi =====
export const KALSHI_REST = "https://api.elections.kalshi.com/trade-api/v2";
export const KALSHI_WS = "wss://api.elections.kalshi.com/trade-api/ws/v2";

// ===== Binance =====
export const BINANCE_CMS_REST = "https://www.binance.com/bapi/composite/v1/public/cms/article/catalog/list/query";
export const BINANCE_CMS_WS = "wss://api.binance.com/sapi/wss"; // official CMS WebSocket

// ===== Contracts (Polygon 137) =====
export const CONTRACTS = {
  CTF_EXCHANGE: "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E",
  NEG_RISK_CTF_EXCHANGE: "0xC5d563A36AE78145C45a50134d48A1215220f80a",
  CONDITIONAL_TOKENS: "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045",
  USDC_E: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
} as const;

// Polymarket taker fee: shares × 0.25 × (p × (1-p))²
// Max at p=0.50: 1.56%. MAKER = ZERO fee + USDC rebate daily.
export function polyTakerFee(shares: number, price: number): number {
  return shares * 0.25 * Math.pow(price * (1 - price), 2);
}

// Kalshi taker fee: ceil(0.07 × contracts × price × (1-price)) — max ~1.75¢/contract at 50¢
export function kalshiTakerFee(contracts: number, price: number): number {
  return Math.ceil(0.07 * contracts * price * (1 - price) * 100) / 100;
}
