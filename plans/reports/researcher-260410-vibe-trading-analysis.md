# Research Report: HKUDS/Vibe-Trading

**Date:** 2026-04-10
**Sources:** GitHub repo, WebFetch analysis, Gemini research
**Relevance:** Integration potential with algo-trader Polymarket arbitrage bot

---

## Executive Summary

Vibe-Trading is a **multi-agent AI finance workspace** by HKUDS (Hong Kong University) that converts natural language → executable trading strategies. MIT licensed. Python/React stack. 68 specialized finance skills, 29 swarm team presets, 7 backtesting engines covering stocks, crypto, futures, forex.

**Key differentiator vs our algo-trader:** Vibe-Trading is a general-purpose strategy GENERATION platform (natural language → code). Our algo-trader is a specialized EXECUTION platform (Polymarket arbitrage + NATS event-driven). They're complementary, not competing.

---

## Architecture

```
User (NL prompt) → ReAct Agent → 68 Skills (7 categories) → Strategy Code
                        ↕
              Multi-Agent Swarm (29 team presets, DAG orchestration)
                        ↓
              Backtest Engine (7 engines) → Performance Report
                        ↓
              TradingView Pine Script v6 Export
```

### Core Components
- **ReAct Agent**: Reasoning + Acting framework (LangChain)
- **68 Skills**: data sourcing, strategy gen, technical/fundamental analysis, crypto/DeFi, options, flow analysis, tooling
- **Swarm Intelligence**: pre-configured teams (investment_committee, crypto_trading_desk, earnings_research_desk) collaborate via DAG workflows
- **MCP Integration**: Claude Desktop compatible (21 MCP tools)

### Tech Stack
| Layer | Technology |
|-------|-----------|
| Backend | Python 3.11+, FastAPI, LangChain |
| Frontend | React 19, Node.js |
| LLMs | OpenRouter, OpenAI, DeepSeek, Gemini, Groq, Qwen, Ollama |
| Data | TuShare, yFinance, OKX, AKShare, CCXT (100+ exchanges) |
| Deploy | Docker, PyPI (`vibe-trading-ai` v0.1.4) |
| License | MIT |

---

## Key Features

### 1. Natural Language → Strategy Code
User describes strategy in plain text → agent generates executable Python → backtests → reports.

### 2. Multi-Agent Swarm Teams (29 presets)
- `investment_committee` — debate + consensus
- `crypto_trading_desk` — crypto-specific analysis
- `earnings_research_desk` — fundamental analysis
- Teams use DAG orchestration for task decomposition

### 3. Statistical Validation
- Monte Carlo permutation testing
- Bootstrap Sharpe ratio confidence intervals
- Walk-forward analysis
- 15+ performance indicators

### 4. Portfolio Optimization
- Mean-Variance Optimization (MVO)
- Risk Parity
- Black-Litterman implied returns
- 4 optimizer methods total

### 5. Cross-Market Support
- A-shares, HK/US equities, crypto, futures, forex
- 5 data sources with auto-fallback
- 7 backtesting engines

---

## Comparative Analysis: Vibe-Trading vs algo-trader

| Aspect | Vibe-Trading | algo-trader |
|--------|-------------|-------------|
| **Focus** | General strategy generation | Polymarket arbitrage execution |
| **Approach** | NL → code generation | Pre-built strategies + event-driven |
| **Markets** | Stocks, crypto, futures, forex | Polymarket (80%) + CEX/DEX (20%) |
| **AI Role** | Generate strategies from prompts | Validate signals, discover dependencies |
| **Architecture** | ReAct agent + swarm | NATS event-driven microservices |
| **Execution** | Backtest-focused | Live trading + paper mode |
| **Data** | yFinance, TuShare, OKX | Polymarket CLOB, Gamma API |
| **Language** | Python | TypeScript |
| **Agent Count** | 29 swarm teams | 19 specialist agents |
| **Strategies** | Generated on-demand | 43 pre-built |

---

## Integration Opportunities for algo-trader

### HIGH VALUE — Adopt These Concepts

**1. ReAct Agent for Strategy Discovery**
Vibe-Trading's ReAct pattern (Reasoning + Acting) could enhance our DeepSeek signal validation. Instead of just validate/reject, the agent could REASON about WHY a signal is valid, exploring multiple angles before deciding.

**Actionable:** Modify `src/intelligence/signal-validator.ts` to use chain-of-thought prompting with explicit reasoning steps before final judgment.

**2. Multi-Agent Swarm for Signal Consensus**
Vibe-Trading uses team debates (investment_committee pattern). We could implement signal consensus: multiple DeepSeek prompts with different "personas" (risk analyst, momentum trader, contrarian) vote on each signal.

**Actionable:** Create `src/intelligence/signal-consensus-swarm.ts` — 3 parallel DeepSeek calls with different system prompts → majority vote.

**3. Statistical Validation for Backtest**
Monte Carlo permutation testing + Bootstrap Sharpe confidence intervals. We lack this — our backtesting is deterministic only.

**Actionable:** Add Monte Carlo simulation to ILP solver results validation.

**4. Portfolio Optimization Methods**
We have mean-variance (Markowitz) only. Vibe-Trading has 4 methods including Black-Litterman and Risk Parity.

**Actionable:** Add Black-Litterman to `src/strategies/polymarket/` for position sizing.

### MEDIUM VALUE — Nice to Have

**5. TradingView Pine Script Export**
Export strategies as Pine Script v6. Could be useful for visualization.

**6. MCP Server Integration**
Vibe-Trading exposes 21 MCP tools for Claude Desktop. We could expose algo-trader's capabilities as MCP tools.

**7. Natural Language Strategy Builder**
Let users describe Polymarket strategies in plain text → generate code. Lower priority since our strategies are already specialized.

### LOW VALUE — Not Applicable

**8. Multi-market data sources** (TuShare, AKShare) — we don't trade A-shares
**9. Frontend dashboard** — we already have one
**10. Docker setup** — we already have production stack

---

## Risk Assessment

### Strengths of Vibe-Trading
- MIT license — can freely adopt patterns
- Comprehensive backtesting validation
- Elegant multi-agent orchestration
- Strong academic backing (HKU)

### Weaknesses
- No specific performance numbers published (no Sharpe ratios, no returns)
- General-purpose = not optimized for any specific market
- Python-only — doesn't match our TypeScript stack
- No live trading execution (backtest-focused)
- No prediction market support (Polymarket)

### Integration Risks
- Language mismatch (Python vs TypeScript) — adopt concepts, not code
- Over-engineering risk — swarm consensus adds latency
- LLM cost — 3x DeepSeek calls per signal for consensus

---

## Academic Paper (Gemini Research)

**Title:** *FinAgent: A Multimodal Foundation Agent for Financial Analysis and Trading*
**Authors:** Chao Huang + HKU Data Intelligence Lab
**Key innovations:**
- **DAG-based multi-agent orchestration** — mimics hedge fund structure
- **OpenSpace Self-Evolution** — bot auto-fixes trading code from backtest failures
- **Multimodal Perception** — processes K-line charts + text + order books
- **Dual-Level Reflection** — internal logic check + external market feedback
- **30-40% lower volatility** in black swan events vs single-agent bots

---

## Recommended Actions (Priority Order)

### Tier 1 — High Impact, Direct Integration

1. **Mini-Swarm Event Analysis** — Replace single DeepSeek call with 3-agent swarm:
   - Agent A: News/social scanner (text)
   - Agent B: Orderbook depth analyzer (numerical)
   - Agent C: Ground truth fetcher (AP News, election results)
   - Coordinator: ILP solver finds gap between synthesized probability and market price

2. **Self-Evolving ILP Constraints** — OpenSpace concept: let LLM suggest new constraints for ILP solver when it misses opportunities. Reflection module rewrites objective function.

3. **Vibe Controller via NATS** — Broadcast mode changes without code deploy:
   `NATS publish: "Switch to Aggressive Arbitrage for US Election markets; ignore <$100k liquidity"`
   Agents reconfigure logic from NATS message.

### Tier 2 — Medium Impact

4. **Dual-Level Reflection** — After each trade: (a) did strategy logic execute correctly? (b) did the trade profit? Feed back into strategy parameters.

5. **Monte Carlo + Bootstrap validation** for ILP backtest results

6. **Black-Litterman optimizer** as alternative to Markowitz for position sizing

### Tier 3 — Future

7. **MCP Server** — expose algo-trader as MCP tools for Claude Desktop
8. **Multimodal chart analysis** — process Polymarket price charts visually

---

## Unresolved Questions

1. ~~Is there an academic paper?~~ YES — FinAgent by Chao Huang, HKUDS
2. Benchmark: "significantly outperforms S&P 500 and RL baselines" — no exact numbers
3. Multi-agent swarm showed 30-40% lower volatility — applicable to prediction markets?
4. Latency overhead of 3-agent swarm for time-sensitive Polymarket arbitrage?
