# @cashclaw/sdk

Official JavaScript/TypeScript client SDK for the CashClaw algo-trade RaaS API.

## Installation

```bash
npm install @cashclaw/sdk
```

## Quick Start

```typescript
import { AlgoTradeClient } from '@cashclaw/sdk';

const client = new AlgoTradeClient({
  baseUrl: 'https://your-algo-trade-server.com',
  apiKey: 'your-api-key',
  timeout: 10000, // optional, default 10s
});

// Check server health (no auth required)
const health = await client.getHealth();
console.log(health.status); // 'ok' | 'degraded' | 'down'
```

## Methods

### Core

| Method | Description |
|--------|-------------|
| `getHealth()` | GET /api/health — server health (public) |
| `getStatus()` | GET /api/status — engine status, active strategies |
| `getTrades()` | GET /api/trades — last 100 trades |
| `getPnl()` | GET /api/pnl — aggregated P&L by strategy |
| `startStrategy(name)` | POST /api/strategy/start |
| `stopStrategy(name)` | POST /api/strategy/stop |

### DEX

| Method | Description |
|--------|-------------|
| `getDexChains()` | GET /api/dex/chains — supported chains |
| `getDexQuote(amountIn, slippageBps?)` | POST /api/dex/quote |
| `dexSwap(params)` | POST /api/dex/swap — execute token swap |

### Kalshi

| Method | Description |
|--------|-------------|
| `getKalshiMarkets()` | GET /api/kalshi/markets |
| `getKalshiBalance()` | GET /api/kalshi/balance |
| `getKalshiPositions()` | GET /api/kalshi/positions |
| `placeKalshiOrder(params)` | POST /api/kalshi/order |
| `scanKalshi()` | GET /api/kalshi/scan — arbitrage opportunities |
| `crossScanKalshi(prices)` | POST /api/kalshi/cross-scan — Kalshi vs Polymarket arb |

## Error Handling

All methods throw `SdkError` on non-2xx responses or network failures.

```typescript
import { AlgoTradeClient, SdkError } from '@cashclaw/sdk';

try {
  const status = await client.getStatus();
} catch (err) {
  if (err instanceof SdkError) {
    console.error(`${err.statusCode} on ${err.endpoint}: ${err.message}`);
    // statusCode = 0 for network/timeout errors
  }
}
```

## License

MIT
