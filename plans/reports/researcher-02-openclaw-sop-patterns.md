# Research: OpenClaw SOPs & AGI Agent Patterns

**Date:** 2026-03-11
**Topic:** SOP structure, AGI patterns, agent orchestration

---

## 1. SOP Structure for Autonomous Agents

### Standard SOP Format
```markdown
# [Agent Name] SOP
## Purpose: [Why this agent exists]
## Scope: [What it controls]
## Triggers: [When it activates]
## Inputs: [Data sources]
## Decision Logic: [IF-THEN rules]
## Actions: [What it executes]
## Safety: [Kill switches, circuit breakers]
## Metrics: [Success/failure tracking]
## Escalation: [When to notify human]
```

### Example: AGI Arbitrage Agent
```
Purpose: Detect and execute triangular arbitrage
Scope: Multi-exchange, 3-leg trades
Triggers: Price spread > 0.5%
Inputs: WebSocket prices, order book depth
Decision: IF profit > fees AND risk < threshold
Actions: Execute buy → convert → sell
Safety: Circuit breaker on 3 consecutive losses
Metrics: Win rate, avg profit, max drawdown
Escalation: Drawdown > 5% → notify human
```

---

## 2. AGI Decision-Making Patterns

### Pattern 1: Rule-Based + LLM
```python
def decide(signal):
    # Fast path: rule-based
    if signal.rsi > 70:
        return "SELL"

    # Slow path: LLM reasoning
    prompt = f"Analyze: {signal}"
    decision = llm.generate(prompt)
    return decision
```

### Pattern 2: Ensemble Voting
```python
decisions = []
for model in [llama_8b, mistral_7b, qwen_14b]:
    decisions.append(model.predict(signal))

final = majority_vote(decisions)
confidence = len(set(decisions)) / len(decisions)
```

### Pattern 3: Chain-of-Thought
```
Signal → LLM generates reasoning → Extract decision
"RSI is 72 (overbought), MACD bearish, volume declining
 → Price likely to reverse → SELL (confidence: 0.78)"
```

---

## 3. OpenClaw Architecture (Existing)

### Files Analyzed
| File | Purpose |
|------|---------|
| `CLAUDE.md` | Constitution, 80% human, 10% CC CLI, 10% customer |
| `mekong/` | Adapters, infra, daemon (NOT skills/commands) |
| `factory/contracts/` | 176 JSON machine contracts |
| `src/core/` | Planner, executor, verifier, orchestrator |

### Agent Roles (from CLAUDE.md)
```
👑 Founder    — Strategy, OKR, fundraising
🏢 Business   — Sales, marketing, finance, HR
📦 Product    — Planning, sprint, roadmap
⚙️ Engineer   — Code, test, deploy, review
🔧 Ops        — Audit, health, security
```

### MCU Billing
- 1 MCU = 1 credit
- Deduct after successful delivery only
- Zero balance → HTTP 402

---

## 4. Agent Orchestration Patterns

### Pattern 1: Sequential Pipeline
```
Planner → Executor → Verifier → Deployer
```
**Use case:** Feature implementation

### Pattern 2: Parallel Execution
```
          → Agent A (frontend)
Planner → → Agent B (backend)  → Merger
          → Agent C (tests)
```
**Use case:** Full-stack features

### Pattern 3: Hierarchical
```
Lead Agent
  → Sub-Agent A (research)
  → Sub-Agent B (code)
  → Sub-Agent C (review)
```
**Use case:** Complex tasks

---

## 5. Safety Circuits & Kill Switches

### Circuit Breaker Pattern
```python
class CircuitBreaker:
    def __init__(self, max_failures=3, timeout=60):
        self.failures = 0
        self.timeout = timeout
        self.last_failure_time = None

    def record_failure(self):
        self.failures += 1
        self.last_failure_time = time.time()

    def is_open(self):
        if self.failures >= self.max_failures:
            if time.time() - self.last_failure_time < self.timeout:
                return True  # Circuit open, block execution
        return False
```

### Kill Switch Conditions
| Condition | Action |
|-----------|--------|
| Drawdown > 5% | Stop trading, notify |
| 3 consecutive losses | Pause 1 hour |
| API error rate > 10% | Fallback mode |
| Latency > 1s | Reduce frequency |
| Model confidence < 0.5 | Human review |

### Safety Layers
1. **Pre-trade:** Risk check, position limit
2. **During-trade:** Circuit breaker, latency monitor
3. **Post-trade:** P&L validation, audit log

---

## 6. Integration with AlgoTrader

### Existing Components
| Component | Integration Point |
|-----------|-------------------|
| `BotEngine.ts` | AGI decision injection |
| `SignalGenerator.ts` | LLM signal enhancement |
| `RiskManager.ts` | AGI risk assessment |
| `OrderManager.ts` | AGI order routing |

### Required SOPs
1. **AGI SignalGenerator SOP** — When to use LLM vs rules
2. **AGIRiskManager SOP** — LLM-based risk scoring
3. **AGIExecutor SOP** — Trade execution with safety
4. **LLMHealthMonitor SOP** — Model health, fallback

---

## Key Insights

1. **SOP = Playbook** — Clear IF-THEN rules + LLM reasoning
2. **Safety first** — Circuit breakers at every layer
3. **Hybrid approach** — Rules for speed, LLM for edge cases
4. **Audit trail** — Log every decision with reasoning
5. **Escalation path** — Auto → Human review on threshold

---

## Unresolved Questions

1. Should AGI agents have separate MCU billing?
2. How to handle LLM hallucination in trading decisions?
3. What's the minimum confidence threshold for auto-execution?

---

**Sources:**
- Internal: `CLAUDE.md`, `mekong/`, `factory/contracts/`
- Pattern: BMAD Method, Agent Teams
