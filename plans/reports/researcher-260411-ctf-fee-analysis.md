# Polymarket CTF Exchange Fee Analysis
**Date:** 2026-04-11 | **Analysis:** Smart Contract Fee Edge Detection

---

## 1. Fee Structure Summary

### Maker vs Taker Split
- **Makers**: 0% fee (limit orders)
- **Takers**: Variable by market category (via dynamic formula)
- **US Exchange**: Taker 0.30%, Maker -0.20% rebate
- **International**: Category-based rates (0.75%-1.80% crypto, 0%-1.50% others)

### Dynamic Fee Formula
```
Fee = C × feeRate × p × (1-p)
Where: C = shares traded, p = share price
Result: Fees peak at $0.50 (50% probability), approach zero at extremes
```

Practical example: $30 @ $0.30 charges identical USDC fee as $70 @ $0.70.

---

## 2. Fee Rebates & Incentives

**Maker Rebates Program** redistributes taker fees daily:
- Crypto: 20% of collected fees
- Other categories: 25% of collected fees
- **Implication**: Market making = net 0-5% gain depending on volume

**Geopolitical markets**: 0% taker fees (completely fee-exempt)

---

## 3. Negative-Risk Markets (Separate Contract)

Standard CTF uses symmetric binary (Yes/No = $1 collateral).

Neg-risk adapter introduces **No-to-Yes conversion** at intermediate step:
- Converts NO tokens into YES tokens in complementary markets
- Charges fee on conversion (not on standard split/merge)
- **Fee timing differs**: Levied during conversion, not at settlement
- **Advantage for traders**: Can avoid post-settlement fees by converting early

**Key edge**: Neg-risk adapter holds separate USDC vault with Yes tokens collected as fee inventory — creates spread opportunity between conversion fee rate and actual collateral exchange rate.

---

## 4. Settlement Mechanics

**Three core operations:**
1. **Split**: USDC → Yes + No pair (no fee)
2. **Merge**: Yes + No → USDC (no fee)
3. **Redeem**: Winning tokens → $1.00 USDC after resolution (no fee)

**Non-custodial**: All settlement on-chain via CTF Exchange contract (0x4bFb... Polygon).

**Fee collection timing**:
- Buy orders: Fees collected in outcome tokens
- Sell orders: Fees collected in collateral (USDC)
- Neg-risk: Fees collected during conversion (separate flow)

---

## 5. Exploitable Fee Patterns

### Edge 1: Extreme Price Avoidance
At $0.01-$0.15 or $0.85-$0.99 prices: `min(p, 1-p)` approaches zero.
- **Exploit**: Split collateral → mint extreme price positions → merge → rebate collector fee arbitrage
- **Example**: Fee at $0.10 ≈ 20% of fee at $0.50 (same size)

### Edge 2: Limit Order Rebate Cascade
Limit orders earn 0.20%-0.25% rebate while market orders pay 0.75%-1.80%.
- **Exploit**: Place deep liquidity on both sides at extremes, farm rebates during rebalancing
- **Risk**: Inventory mismatch, execution on adverse side

### Edge 3: Neg-Risk Conversion Routing
- Standard market → standard CTF Exchange: subject to regular fee formula
- Neg-risk market → conversion adapter: subject to separate fee rate
- **Exploit**: If conversion fee < standard formula fee at certain price ranges, use adapter path

### Edge 4: Market Category Selection
Geopolitical markets charge 0% taker fees.
- **Exploit**: Execute high-volume on geo markets, pay zero taker fees (if using taker side)
- **Caveat**: Liquidity is lower; spreads may offset fee savings

### Edge 5: Deposit/Withdrawal Cost Minimization
- Crypto transfers: ~$0.01 Polygon gas (negligible)
- MoonPay deposits: 2-3% fee (avoid)
- **Exploit**: Batch deposits via crypto exchange → single low-cost transfer, reduces per-trade overhead

---

## 6. Unresolved Questions

1. **Neg-risk conversion fee rate**: Is it fixed or dynamic? How does it compare numerically to standard fee formula?
2. **Rebate timing**: When exactly are rebates paid? Clawback risk if rebate program ends?
3. **Settlement lag**: Are fees deducted immediately or post-resolution? Can liquidators exploit timing?
4. **Rounding edge**: Fees rounded to 5 decimal places — can dust attacks accumulate rebate eligibility?
5. **Mint/merge fees**: Do split/merge operations trigger any infrastructure fees beyond transaction gas?

---

## Summary

**Highest-confidence edges**:
1. Extreme price fee reduction (10-20% savings @ $0.10/$0.90)
2. Maker rebate farming (0.20-0.25% passive gain)
3. Geo market zero fees (if liquidity exists)

**Medium-confidence edges**:
1. Neg-risk conversion routing (needs actual fee rate comparison)
2. Market category selection (rebate optimization)

**Requires live data**:
- Actual neg-risk conversion fee rates
- Rebate program current rates
- Inventory availability on both sides for rebate execution

---

Sources:
- [Polymarket Fees Documentation](https://docs.polymarket.com/trading/fees)
- [CTF Exchange Repository](https://github.com/Polymarket/ctf-exchange)
- [Neg-Risk CTF Adapter](https://github.com/Polymarket/neg-risk-ctf-adapter)
- [Prediction Hunt Fee Guide](https://www.predictionhunt.com/blog/polymarket-fees-complete-guide)
