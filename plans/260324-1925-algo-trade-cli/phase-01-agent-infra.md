---
phase: 1
status: pending
owner: agent-infra-dev
---

# Phase 1: Agent Infrastructure

## Overview
Create AgentBase interface, AgentDispatcher, and CommandRegistry — foundation for all specialist agents.

## Files to Create
- `src/agents/agent-base.ts` — AgentTask, AgentResult, SpecialistAgent interfaces
- `src/agents/agent-dispatcher.ts` — Routes tasks to registered agents
- `src/agents/command-registry.ts` — Dynamic command registration with Commander.js

## Architecture

```typescript
// agent-base.ts
interface AgentTask {
  id: string;
  type: string; // 'scan' | 'estimate' | 'monitor' | 'risk' | 'calibrate' | 'report' | 'doctor'
  payload: Record<string, unknown>;
}

interface AgentResult {
  agentName: string;
  success: boolean;
  data: unknown;
  error?: string;
  durationMs: number;
}

interface SpecialistAgent {
  name: string;
  description: string;
  taskTypes: string[];
  canHandle(task: AgentTask): boolean;
  execute(task: AgentTask): Promise<AgentResult>;
}
```

```typescript
// agent-dispatcher.ts
class AgentDispatcher {
  private agents: Map<string, SpecialistAgent>;
  register(agent: SpecialistAgent): void;
  dispatch(task: AgentTask): Promise<AgentResult>;
  listAgents(): { name: string; description: string; taskTypes: string[] }[];
}
```

```typescript
// command-registry.ts
- Takes Commander program + AgentDispatcher
- registerCommand(name, description, options, taskType) — auto-wires CLI → dispatcher
- Exports createCommandRegistry(program, dispatcher)
```

## Implementation Steps
1. Create `src/agents/agent-base.ts` with interfaces + helper `createTask()`
2. Create `src/agents/agent-dispatcher.ts` with register/dispatch/list
3. Create `src/agents/command-registry.ts` with dynamic command registration
4. Create `src/agents/index.ts` barrel export

## Success Criteria
- `npx tsc --noEmit` passes
- Interfaces are importable from `src/agents/index.ts`
