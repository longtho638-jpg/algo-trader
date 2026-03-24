---
status: completed
created: 2026-03-24
slug: algo-trade-cli
---

# Algo-Trade CLI — Mekong-style AgentDispatcher Architecture

## Overview
Build a Mekong-CLI-style command system with AgentDispatcher pattern. 1 OpenClaw brain dispatching to specialist agents via CLI commands.

**Research:** `plans/reports/research-260324-1912-algo-trade-cli-architecture.md`

## Current State
- 5 commands: start, status, backtest, config, hedge-scan
- OpenClaw command group: analyze, tune, report, observe, status
- Commander.js already in use
- EventBus + StrategyOrchestrator exist
- 426 TS files, well-structured modules

## Target State
- AgentDispatcher + AgentBase pattern
- 7 specialist agents wrapping existing code
- ~15 CLI commands (Freqtrade-style)
- Dynamic command registry

## Phases

### Phase 1: Agent Infrastructure (parallel-safe) — `phase-01-agent-infra.md`
- [x] AgentBase interface + AgentResult type
- [x] AgentDispatcher class
- [x] Command Registry
- **Files:** `src/agents/base.ts`, `src/agents/dispatcher.ts`, `src/agents/registry.ts`
- **Owner:** agent-infra-dev

### Phase 2: Specialist Agents (parallel-safe) — `phase-02-specialist-agents.md`
- [x] ScannerAgent (wraps market-scanner)
- [x] MonitorAgent (wraps strategy-orchestrator status)
- [x] EstimateAgent (wraps ensemble-estimator)
- [x] RiskAgent (wraps risk-manager)
- [x] CalibrateAgent (wraps calibration-tuner)
- [x] ReportAgent (wraps PnL/trade data)
- [x] DoctorAgent (system health check)
- **Files:** `src/agents/*.ts`
- **Owner:** agents-dev

### Phase 3: CLI Commands + Wiring — `phase-03-cli-commands.md`
- [x] `algo scan` command
- [x] `algo monitor` command
- [x] `algo estimate` command
- [x] `algo risk` command
- [x] `algo calibrate` command
- [x] `algo report` command
- [x] `algo doctor` command
- [x] Wire commands to AgentDispatcher
- [x] Update `src/cli/index.ts` entry point
- **Files:** `src/cli/commands/*.ts`, `src/cli/index.ts`
- **Owner:** cli-dev

### Phase 4: Tests — `phase-04-tests.md`
- [x] Agent unit tests
- [x] Dispatcher tests
- [x] CLI integration tests
- **Owner:** tester

## Dependencies
```
Phase 1 → Phase 2 → Phase 3 → Phase 4
          (Phase 1 + 2 can partially overlap)
```

## Progress: 4/4 phases DONE
