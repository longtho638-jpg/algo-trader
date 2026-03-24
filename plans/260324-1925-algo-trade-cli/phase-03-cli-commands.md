---
phase: 3
status: pending
owner: cli-dev
---

# Phase 3: CLI Commands + Wiring

## Overview
Create new CLI commands that dispatch through AgentDispatcher. Update entry point.

## Files to Create/Modify
- `src/cli/commands/scan-cmd.ts` — `algo scan [--category X] [--limit N]`
- `src/cli/commands/monitor-cmd.ts` — `algo monitor [--json] [--watch]`
- `src/cli/commands/estimate-cmd.ts` — `algo estimate <question>`
- `src/cli/commands/risk-cmd.ts` — `algo risk`
- `src/cli/commands/calibrate-cmd.ts` — `algo calibrate [--db-path P]`
- `src/cli/commands/report-cmd.ts` — `algo report [--period daily|weekly]`
- `src/cli/commands/doctor-cmd.ts` — `algo doctor`
- **Modify:** `src/cli/index.ts` — wire all new commands + AgentDispatcher

## Command Pattern
Each command file:
1. Create Commander Command
2. In action handler: create AgentTask → dispatcher.dispatch() → print result
3. Export the command

## Entry Point Update (index.ts)
```typescript
import { AgentDispatcher } from '../agents/agent-dispatcher.js';
// import all agent creators
// import all command creators

const dispatcher = new AgentDispatcher();
// register all agents
// register all commands with dispatcher context
program.addCommand(scanCommand(dispatcher));
// ... etc
```

## Success Criteria
- `npx tsc --noEmit` passes
- `npx tsx src/cli/index.ts --help` shows all commands
- `npx tsx src/cli/index.ts doctor` runs successfully
