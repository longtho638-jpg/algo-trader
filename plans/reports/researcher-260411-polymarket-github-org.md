# Research Report: Polymarket GitHub Organization

**Date:** 2026-04-11
**Source:** https://github.com/Polymarket (99+ repos)

## Executive Summary

Polymarket has 99+ repos. Key discovery: **`clob-client-v2`** (updated Apr 10, 2026) uses **viem** instead of ethers.js — this is the future. Also **`polymarket-cli`** (2,142 stars) and **`agents`** (2,800 stars) are massively popular.

## Key Repositories (by relevance to CashClaw)

### Tier 1 — Must Use

| Repo | Stars | Lang | Purpose |
|------|-------|------|---------|
| **clob-client-v2** | 2 | TS | NEW v2 client (viem-based). Updated yesterday. |
| **py-clob-client-v2** | 8 | Python | NEW v2 Python client. Updated yesterday. |
| **rs-clob-client** | 647 | Rust | Rust CLOB client — for HFT/low-latency |
| **agents** | 2,800 | Python | Official AI trading framework (LangChain + Chroma) |
| **polymarket-cli** | 2,142 | Rust | CLI trading tool |

### Tier 2 — Smart Contracts

| Repo | Stars | Lang | Purpose |
|------|-------|------|---------|
| **ctf-exchange** | 345 | Solidity | Core CTF (Conditional Token Framework) exchange |
| **neg-risk-ctf-adapter** | 81 | Solidity | Neg-risk adapter (multi-outcome events) |
| **uma-ctf-adapter** | 116 | Solidity | UMA oracle resolution adapter |

### Tier 3 — Utilities

| Repo | Stars | Lang | Purpose |
|------|-------|------|---------|
| **clob-order-utils** | 23 | TS | Order generation + EIP-712 signing |
| **polymarket-sdk** | 61 | TS | Wallet SDK |
| **builder-signing-sdk** | 22 | TS | Builder authentication headers |

## Critical Finding: clob-client-v2

### Changes from v1
- **viem** replaces ethers.js (lighter, faster, better typed)
- **Two-tier auth**: L1 (EIP-712 wallet) + L2 (HMAC for orders)
- **Throw mode**: `throwOnError: true` for proper error handling
- **Market orders**: FOK + FAK support (amount in USDC)
- **608 commits**, 12 contributors, MIT license

### Migration Impact for CashClaw
Our `src/execution/polymarket-signer.ts` uses ethers.js. Should migrate to clob-client-v2 (viem) for:
- Better TypeScript types
- Smaller bundle
- Official support going forward
- v1 likely to be deprecated

## Polymarket Agents Framework (2.8K stars)

Official AI trading framework:
- **LangChain** for LLM orchestration
- **Chroma** for vector embeddings (news)
- **RAG** approach: data → embed → reason → trade
- Supports OpenAI API (compatible with DeepSeek)

### Comparison with CashClaw
| Feature | Polymarket Agents | CashClaw |
|---------|------------------|----------|
| Language | Python | TypeScript |
| LLM | OpenAI only | DeepSeek + Nemotron + any |
| Strategies | User-defined (RAG) | 43+ built-in |
| Architecture | Single agent | Multi-agent swarm (3 personas) |
| Event-driven | No | NATS + JetStream |
| Cross-platform | No | Kalshi price feed |
| RaaS | No | Full billing/licensing |

**CashClaw is significantly more advanced** than Polymarket's own agents framework.

## Actionable Recommendations

### Priority 1: Migrate to clob-client-v2
- Install `@polymarket/clob-client-v2` + `viem`
- Replace ethers.js signing in `polymarket-signer.ts`
- Use official L1/L2 auth flow

### Priority 2: Study polymarket-cli (Rust)
- 2,142 stars — most popular tool
- Study its order routing + execution patterns
- Consider wrapping via NATS for HFT path

### Priority 3: Integrate neg-risk-ctf-adapter patterns
- Multi-outcome events (YES sum > 1 across options)
- This is WHERE the arb exists — neg-risk markets

### Priority 4: Vector embeddings via Chroma (from agents repo)
- We have TF-IDF vectors — Chroma would be better
- LangChain integration pattern available

## Unresolved Questions
1. Will clob-client v1 be deprecated? No announcement yet.
2. What are current CLOB rate limits? (not in v2 docs)
3. Does v2 support WebSocket orderbook streaming?
4. neg-risk markets: how to detect and trade them via API?
