# Research: Polymarket Deep Dark Edges — Agentic CLI Exploitation

**Date:** 2026-03-24 | **Sources:** 5 Gemini deep searches + codebase analysis

---

## Executive Summary

Current 7 commands + blind estimation = good foundation, BUT we're leaving money on the table. 5 dark zones identified where agentic CLI can penetrate deeper into Polymarket ecosystem. Biggest untapped edges: **on-chain CTF monitoring** (whale front-running), **resolution deadline exploitation** (UMA oracle window), **Gamma API related-markets clustering** (correlated portfolio), and **news-to-trade latency pipeline** (2.7s window in 2026).

---

## 1. CLOB Microstructure Dark Edges

### 1.1 Order Priority: Price-Time (FIFO)
- Polymarket CLOB uses **price-time priority** (not pro-rata)
- Edge: Being first at a price level matters. Queue position = alpha
- **Agent opportunity:** `algo queue-snipe` — monitor book depth, place limit orders at key levels BEFORE crowd arrives

### 1.2 Maker/Taker Fee Structure
- **Makers: 0% fee** (limit orders that add liquidity)
- **Takers: ~1-2% fee** (market orders that remove liquidity)
- Edge: Always be the maker. Never market-order unless edge > 3%
- **Agent opportunity:** Ensure all execution uses limit orders with `postOnly` flag

### 1.3 Neg-Risk Markets (Complementary Outcomes)
- Multi-outcome events (e.g., "Who wins election?") have N tokens summing to $1.00
- Edge: If YES_A + YES_B + YES_C < $0.98, arb exists (buy all, guaranteed $1 payout minus cost)
- **Agent opportunity:** `algo neg-risk-scan` — scan all multi-outcome events for sum < $0.98 or > $1.02

### 1.4 Tick Size Exploitation
- Min tick = $0.01 (1 cent). Binary markets = 0.01 to 0.99
- Edge: Near resolution (0.95+), each tick = 5%+ return. At 0.99, buying at 0.98 = 2% guaranteed if correct
- **Agent opportunity:** `algo endgame` — target markets within 24h of resolution where price > 0.90

### 1.5 WebSocket vs REST Latency
- WebSocket orderbook stream: **~50-200ms** updates
- REST `/book` endpoint: **~500-1000ms** per call (rate limited)
- Edge: WS gives 300-800ms advantage over REST-only bots
- **Already implemented** in `orderbook-stream.ts` — good

### 1.6 FOK/IOC/GTC Order Types
- **GTC**: Good-til-cancelled (default, stays on book)
- **FOK**: Fill-or-kill (atomic execution, no partial fills)
- **GTD**: Good-til-date (auto-cancel at expiry)
- Edge: FOK for large orders prevents being picked off. GTD for time-sensitive bets

---

## 2. Gamma API Hidden Features

### 2.1 Event Grouping (CRITICAL DARK ZONE)
```
GET https://gamma-api.polymarket.com/events?slug=<event-slug>
GET https://gamma-api.polymarket.com/events?id=<event-id>
```
- Returns ALL markets under one event (e.g., all state races under "2024 Election")
- **Dark edge:** Cross-market correlation within events. If "Trump wins PA" moves, "Trump wins MI" should follow
- **Agent opportunity:** `algo event-cluster` — build correlation matrix within events, trade lagging markets

### 2.2 Hidden Query Parameters
```
GET /markets?tag=politics&active=true&closed=false&order=volume&ascending=false
GET /markets?related_to=<condition_id>  # UNDERDOCUMENTED
GET /markets?end_date_min=2026-03-25&end_date_max=2026-03-31  # Resolution window filter
```
- `tag` filter: politics, crypto, sports, pop-culture, science, business
- `end_date_min/max`: Filter by resolution window — find markets resolving soon
- `related_to`: Find markets correlated to a given condition

### 2.3 Volume Anomaly Before Resolution
- Gamma API returns `volume`, `volume24hr`, `liquidity` per market
- **Dark edge:** Sudden volume spike (>3x 24h avg) before resolution = someone knows something
- **Agent opportunity:** `algo volume-alert` — monitor volume anomalies across all active markets

### 2.4 UMA Oracle Resolution Mechanics
```
Resolution Flow:
1. Event ends → Proposer submits outcome → 2h challenge window
2. If no challenge → Resolution finalized → Tokens redeemable
3. If challenged → UMA DVM vote (24-48h)
```
- **Dark edge:** During 2h challenge window, market often trades at 0.95-0.99 (not 1.00)
- Bots can buy YES at 0.97 after proposal, redeem at 1.00 = risk-free 3%
- **Agent opportunity:** `algo resolution-arb` — monitor UMA proposals, buy during challenge window

### 2.5 Market Creator Signals
- Gamma API returns `creator` field for each market
- Some creators (official Polymarket team vs community) resolve faster/more reliably
- **Agent opportunity:** Track creator reliability scores

---

## 3. On-Chain CTF Dark Edges (BIGGEST UNTAPPED ZONE)

### 3.1 Contract Addresses (Polygon)
```
CTF Exchange:    0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E
NegRiskAdapter:  0xC5d563A36AE78145C45a50134d48A1215220f80a
NegRiskExchange: 0xC5d563A36AE78145C45a50134d48A1215220f80a
USDC Collateral: 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174
```

### 3.2 Key Events to Monitor
```solidity
// PositionSplit — someone minting YES+NO tokens (entering market)
event PositionSplit(address indexed stakeholder, bytes32 parentCollectionId,
                    bytes32 indexed conditionId, uint[] partition, uint amount);

// PayoutRedemption — someone redeeming tokens (resolution-aware)
event PayoutRedemption(address indexed redeemer, bytes32 indexed conditionId,
                       uint[] indexSets, uint payout);

// TransferSingle — ERC1155 token transfer (whale movement)
event TransferSingle(address indexed operator, address indexed from,
                     address indexed to, uint256 id, uint256 value);
```

### 3.3 Whale Tracking Strategy
```typescript
// Monitor large TransferSingle events on CTF Exchange
const ctfExchange = new ethers.Contract(CTF_ADDRESS, CTF_ABI, provider);
ctfExchange.on('TransferSingle', (operator, from, to, id, value) => {
  const usdcValue = Number(value) / 1e6;
  if (usdcValue > 10000) { // Whale alert: >$10K position
    // Map token ID → market via CLOB API
    // If whale is BUYING YES → bullish signal
    // If whale is SELLING/REDEEMING → resolution imminent
  }
});
```

### 3.4 Pre-Resolution Redemption Signal
- When `PayoutRedemption` events spike, resolution is imminent
- Bots can detect this 1-5 minutes before price fully adjusts
- **Agent opportunity:** `algo whale-watch` — real-time on-chain whale + redemption monitoring

### 3.5 Split/Merge Arbitrage
- `splitPosition`: Convert $1 USDC → 1 YES + 1 NO token
- `mergePosition`: Convert 1 YES + 1 NO → $1 USDC
- If YES + NO < $1.00 on CLOB: Buy both → merge → profit
- If YES + NO > $1.00 on CLOB: Split → sell both → profit
- **Agent opportunity:** `algo split-merge-arb` — continuous monitoring of YES+NO sum vs $1.00

---

## 4. Profitable Strategy Patterns (Dark Horse Plays)

### 4.1 News-to-Trade Pipeline (2.7s window in 2026)
```
Twitter/X mention → LLM classify → Market lookup → Execute
Timeline: 0s → 0.5s → 1.5s → 2.5s
```
- Window collapsed from 12.3s (2025) to 2.7s (2026)
- Still viable for LONG-TAIL markets (not crypto price)
- **Agent opportunity:** `algo news-snipe` — Twitter firehose → LLM filter → auto-trade

### 4.2 Resolution Deadline Exploitation
- Markets near resolution (< 24h) with high confidence = almost risk-free
- Buy YES at 0.95 when outcome is 99% certain = 5% return in hours
- **Agent opportunity:** `algo endgame-sweep` — scan resolving-soon markets with high LLM confidence

### 4.3 Cross-Platform Arbitrage (Polymarket ↔ Kalshi)
- Same events often have 3-7% spread between platforms
- Market-neutral: buy cheap side, sell expensive side
- **Already partially implemented** in `kalshi-market-scanner.ts`

### 4.4 Social Sentiment Contrarian
- Viral Twitter threads cause herding (crowd pumps one side)
- LLM + base rate analysis often shows crowd is wrong
- **Agent opportunity:** `algo contrarian` — detect herding, take opposite position if LLM disagrees

---

## 5. Recommended New Commands for Algo-Trade CLI

### Priority 1 (Highest Edge, Implement First)
| Command | Agent | Edge | Effort |
|---------|-------|------|--------|
| `algo neg-risk-scan` | NegRiskArbAgent | 2-5% risk-free | 0.5 day |
| `algo resolution-arb` | ResolutionArbAgent | 1-3% near risk-free | 1 day |
| `algo endgame` | EndgameAgent | 3-5% high-confidence | 0.5 day |
| `algo whale-watch` | WhaleWatchAgent | Information edge | 1 day |

### Priority 2 (Good Edge, Needs More Infra)
| Command | Agent | Edge | Effort |
|---------|-------|------|--------|
| `algo event-cluster` | EventClusterAgent | Correlation alpha | 1 day |
| `algo volume-alert` | VolumeAlertAgent | Insider detection | 0.5 day |
| `algo split-merge-arb` | SplitMergeAgent | Arbitrage | 1 day |

### Priority 3 (Requires External Data)
| Command | Agent | Edge | Effort |
|---------|-------|------|--------|
| `algo news-snipe` | NewsSniperAgent | Latency alpha | 2 days |
| `algo contrarian` | ContrarianAgent | Sentiment alpha | 1 day |

---

## 6. Architecture for New Agents

```
algo neg-risk-scan     → NegRiskArbAgent      → Gamma API (multi-outcome events)
algo resolution-arb    → ResolutionArbAgent    → UMA Oracle Monitor
algo endgame           → EndgameAgent          → Gamma API (resolving-soon filter)
algo whale-watch       → WhaleWatchAgent       → Polygon RPC (CTF events)
algo event-cluster     → EventClusterAgent     → Gamma /events API
algo volume-alert      → VolumeAlertAgent      → Gamma /markets (volume tracking)
algo split-merge-arb   → SplitMergeAgent       → CLOB prices + CTF contract
algo news-snipe        → NewsSniperAgent       → Twitter API + LLM
algo contrarian        → ContrarianAgent       → Social signals + LLM
```

All agents implement `SpecialistAgent` interface → register with `AgentDispatcher` → accessible via `algo <command>`.

---

## Unresolved Questions

1. Twitter/X API access — need elevated API tier or scraping solution for news-snipe
2. Polygon RPC rate limits — need dedicated node or Alchemy/QuickNode for whale-watch
3. UMA oracle ABI — need to verify current contract for resolution-arb
4. Kalshi API regulatory restrictions — cross-platform arb may have compliance issues
5. On-chain monitoring cost — Polygon RPC calls at scale needs budgeting
