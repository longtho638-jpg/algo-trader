---
title: "Phase 1 - Multi-Agent Trading System"
description: "Implement 5 agents với event bus communication"
status: pending
priority: P1
effort: 5h
---

# Phase 1: Multi-Agent Trading System

## Context Links

- [Plan Overview](./plan.md)
- [AgentEventBus](../src/a2ui/agent-event-bus.ts)
- [AutonomyController](../src/core/autonomy-controller.ts)
- [PluginSystem](../src/core/bot-engine-plugins.ts)
- [A2UI Types](../src/a2ui/types.ts)

## Overview

**Mục tiêu:** Xây dựng hệ thống multi-agent với 5 agents chuyên biệt giao tiếp qua event bus.

**Kiến trúc:**
```
TradingSupervisor (orchestrator)
       ↓
   AgentEventBus (pub/sub)
       ↓
┌──────┬─────────┬──────────┬──────────────┐
│      │         │          │              │
Market  Risk     Execution  Strategy       AgentComm
Analysis Mgmt    Agent      Router         Protocol
```

## Key Insights

1. **Event Bus đã có:** `AgentEventBus` hỗ trợ multi-tenant, typed events
2. **Autonomy Controller:** 4-tier autonomy dial (OBSERVE → AUTONOMOUS)
3. **Plugin System:** BotPlugin hooks (onPreTrade, onPostTrade, onSignal)

## Requirements

### Functional

- [ ] BaseAgent abstract class với lifecycle methods
- [ ] TradingSupervisor orchestrate agents
- [ ] MarketAnalysisAgent phân tích indicators
- [ ] RiskManagementAgent kiểm tra risk limits
- [ ] ExecutionAgent thực thi orders
- [ ] AgentCommunication protocol message types

### Non-Functional

- [ ] Type-safe events (TypeScript strict)
- [ ] Async event handling (Promise.all)
- [ ] Error isolation (agent failure ≠ system crash)
- [ ] Multi-tenant isolation (tenantId routing)

## Architecture

### Agent Lifecycle

```
init() → onSignal() → onPreTrade() → onPostTrade() → cleanup()
```

### Event Flow

```
1. MarketAnalysisAgent emits SIGNAL_RATIONALE
2. TradingSupervisor receives, routes to RiskManagementAgent
3. RiskManagementAgent validates → emits RISK_ALERT or APPROVED
4. ExecutionAgent executes if APPROVED + autonomy allows
5. All agents receive onPostTrade for learning
```

## Files to Create

| File | Purpose | Lines |
|------|---------|-------|
| `src/agents/base-agent.ts` | Abstract base class | ~80 |
| `src/agents/trading-supervisor.ts` | Orchestrator | ~150 |
| `src/agents/market-analysis-agent.ts` | Technical analysis | ~120 |
| `src/agents/risk-management-agent.ts` | Risk checks | ~100 |
| `src/agents/execution-agent.ts` | Order execution | ~120 |
| `src/agents/agent-communication.ts` | Message protocol | ~80 |

## Implementation Steps

### Step 1: Base Agent (~30min)

```typescript
// src/agents/base-agent.ts
export abstract class BaseAgent {
  abstract readonly name: string;
  abstract readonly version: string;

  constructor(protected eventBus: AgentEventBus) {}

  abstract init(config?: unknown): Promise<void>;
  abstract onSignal(signal: ISignal): Promise<ISignal | null>;
  abstract onPreTrade(trade: PreTradeInfo): Promise<TradeDecision>;
  abstract onPostTrade(trade: PostTradeInfo): Promise<void>;
  abstract cleanup(): Promise<void>;
}
```

### Step 2: Agent Communication Protocol (~30min)

```typescript
// src/agents/agent-communication.ts
export interface AgentMessage {
  messageId: string;
  fromAgent: string;
  toAgent: string | 'BROADCAST';
  type: 'SIGNAL' | 'DECISION' | 'ALERT' | 'STATUS';
  payload: unknown;
  timestamp: number;
  tenantId: string;
}

export class AgentCommunication {
  sendMessage(msg: AgentMessage): Promise<void>;
  registerHandler(agent: string, handler: (msg: AgentMessage) => void): void;
}
```

### Step 3: Trading Supervisor (~60min)

- Subscribe to all agent events
- Orchestrate signal flow
- Handle autonomy gating
- Emit audit events

### Step 4: Market Analysis Agent (~45min)

- Calculate indicators (RSI, SMA, EMA)
- Emit SIGNAL_RATIONALE events
- Support multiple strategies

### Step 5: Risk Management Agent (~45min)

- Check daily loss limit
- Validate position sizing
- Monitor drawdown
- Emit RISK_ALERT

### Step 6: Execution Agent (~45min)

- Connect to ExchangeClient
- Handle order lifecycle
- Emit TRADE_EXECUTED events
- Retry logic with backoff

## Success Criteria

- [ ] 6 files created, <200 lines each
- [ ] Agents register với event bus
- [ ] Signal flow end-to-end working
- [ ] Unit tests cho mỗi agent
- [ ] Integration test: signal → execution

## Risks & Mitigation

| Risk | Mitigation |
|------|------------|
| Event loop congestion | Async handlers với timeout |
| Circular dependencies | Strict单向 communication |
| State synchronization | Event sourcing pattern |
| Performance overhead | Batch events khi possible |

## Next Steps

1. Implement base-agent.ts
2. Implement agent-communication.ts
3. Implement trading-supervisor.ts
4. Implement 3 concrete agents
5. Write tests
6. Integration với existing BotEngine
