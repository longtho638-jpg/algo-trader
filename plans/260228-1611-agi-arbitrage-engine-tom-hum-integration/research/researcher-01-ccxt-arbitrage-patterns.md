# CCXT Cross-Exchange Arbitrage Patterns Research

**Date:** 2026-02-28
**Focus:** Multi-exchange BTC/USDT arbitrage (Binance, OKX, Bybit)
**Status:** Research complete

## 1. CCXT Multi-Exchange Price Fetch

CCXT supports 100+ exchanges including Binance, OKX, Bybit. Simultaneous price fetching pattern:

```python
import ccxt
import asyncio

async def fetch_prices(symbols):
    exchanges = {
        'binance': ccxt.binance(),
        'okx': ccxt.okx(),
        'bybit': ccxt.bybit()
    }

    tasks = []
    for name, exchange in exchanges.items():
        tasks.append(fetch_ticker(exchange, symbols))

    results = await asyncio.gather(*tasks)
    return results

# Concurrent fetch (not sequential) reduces latency
```

**Key:** Parallel requests via `asyncio.gather()` → ~100ms total vs 300ms serial.

## 2. Fee Structure (Per Exchange)

| Exchange | Maker | Taker | Withdrawal | Notes |
|----------|-------|-------|------------|-------|
| **Binance** | 0.1% | 0.1% | 0.0005 BTC | Standard tier |
| **OKX** | 0.08% | 0.1% | 0.0005 BTC | VIP reduces fees |
| **Bybit** | 0.1% | 0.1% | 0.0005 BTC | Flat rate |

**CCXT Fee Access:**
```python
exchange.fees['trading']['maker']  # 0.0008
exchange.fees['trading']['taker']  # 0.001
exchange.fees['withdraw'][coin]    # BTC withdrawal fee
```

## 3. Latency & Race Conditions

**Critical Issue:** 100ms delay between exchanges kills arbitrage. Mitigation:

- **Co-location:** Deploy bot in exchange data center (AWS, Alibaba)
- **WebSocket:** Replace REST polling (100-200ms) with WebSocket (~10ms)
- **Execution Risk:** If buy fills at t, price moves by t+Δt before sell → negative spread

**Reality Check:** Profitable spread ~0.3% → After fees (0.2%) = 0.1% net before slippage.
If execution latency > 500ms, expect 0.2-0.5% slippage → **UNPROFITABLE**.

## 4. Profit Calculation Formula

```
Gross Spread = (Price_B - Price_A) / Price_A

Total Cost = Maker_Fee_A + Taker_Fee_B + Withdrawal_Fee + Slippage

Net Profit % = Gross Spread - Total Cost

Example:
  Binance BTC: $100,000 (BUY)
  OKX BTC: $100,300 (SELL)

  Spread = 300/100,000 = 0.30%

  Costs:
    - Binance maker: 0.10%
    - OKX taker: 0.10%
    - Withdrawal: $50 / $100,000 = 0.05%
    - Slippage (estimated): 0.05%
  Total: 0.30%

  Net Profit = 0.30% - 0.30% = 0% (BREAK-EVEN, HIGH RISK)
```

**Threshold:** Only execute if Net Profit > 0.15% (after all costs).

## 5. Safety Mechanisms

**Must-Have:**

1. **Position Limits** → Max 1 BTC exposure per arbitrage leg
2. **Circuit Breaker** → Stop if:
   - Spread < 0.15% (unprofitable)
   - Execution delay > 500ms
   - Exchange latency spike detected
   - Failed order on any leg → immediate unwind

3. **Rate Limiting** (CCXT):
   ```python
   exchange.rateLimit = 200  # 200ms between requests
   # Binance: 1200 req/min → 20 req/sec OK
   # OKX: 10 req/sec max → use 100ms delay
   ```

4. **Order Timeout** → 30-60s max wait; cancel + reverse if no fill

5. **Slippage Buffer** → Reserve 0.2% for price movements during execution

## Key Insight

CCXT alone insufficient for profitable arbitrage. Need:
- **Low-latency infrastructure** (< 100ms round-trip)
- **Maker order placement** on entry leg (reduce fees)
- **Dynamic spread detection** (only trade when >0.25%)
- **Atomic execution** (both legs execute or both cancel)

**Viability:** Spot arbitrage profitable only in bull markets with >0.5% spreads.
Sustainable strategy: Stateless liquidity provision (market-making) rather than pure arbitrage.

---

## Sources

- [CCXT GitHub - Cryptocurrency Trading Library](https://github.com/ccxt/ccxt)
- [CCXT Official Documentation](https://docs.ccxt.com/)
- [CCXT PyPI Package](https://pypi.org/project/ccxt/)
- [Fee Calculation Best Practices](https://axon.trade/fees-rebates-and-maker-taker-math)
- [Latency Arbitrage Research](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5143158)
- [Rate Limiting Best Practices](https://medium.com/codenx/circuit-breaker-vs-throttling-vs-rate-limiting-f99053630848)
