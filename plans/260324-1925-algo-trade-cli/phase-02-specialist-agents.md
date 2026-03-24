---
phase: 2
status: pending
owner: agents-dev
---

# Phase 2: Specialist Agents

## Overview
Create 7 specialist agents wrapping existing modules. Each implements SpecialistAgent interface.

## Files to Create
- `src/agents/scanner-agent.ts` — wraps polymarket/market-scanner
- `src/agents/monitor-agent.ts` — wraps strategy-orchestrator getStatus()
- `src/agents/estimate-agent.ts` — wraps openclaw/ensemble-estimator
- `src/agents/risk-agent.ts` — wraps core/risk-manager
- `src/agents/calibrate-agent.ts` — wraps openclaw/calibration-tuner
- `src/agents/report-agent.ts` — wraps PnL/trade data from database
- `src/agents/doctor-agent.ts` — system health check (DB, DeepSeek, bot process)

## Agent Specs

### ScannerAgent (type: 'scan')
- Payload: `{ category?: string, limit?: number }`
- Wraps: `MarketScanner.scan()` or simplified version
- Returns: list of market opportunities

### MonitorAgent (type: 'monitor')
- Payload: `{ watch?: boolean, json?: boolean }`
- Wraps: `StrategyOrchestrator.getStatus()`
- Returns: strategy statuses, tick counts, errors

### EstimateAgent (type: 'estimate')
- Payload: `{ question: string, marketId?: string }`
- Wraps: `EnsembleEstimator.estimate()`
- Returns: probability estimate with confidence

### RiskAgent (type: 'risk')
- Payload: `{}`
- Wraps: `RiskManager` state check
- Returns: portfolio risk metrics, position limits

### CalibrateAgent (type: 'calibrate')
- Payload: `{ dbPath?: string }`
- Wraps: `CalibrationTuner.analyzeFromDb()`
- Returns: calibration analysis, Brier score, bias

### ReportAgent (type: 'report')
- Payload: `{ period?: 'daily' | 'weekly' | 'all' }`
- Wraps: database trade queries
- Returns: PnL summary, win rate, trade count

### DoctorAgent (type: 'doctor')
- Payload: `{}`
- Checks: DB connectivity, DeepSeek health, disk space, process status
- Returns: health check results

## Implementation Pattern
Each agent: import deps lazily, implement canHandle + execute, export create function.

## Success Criteria
- All 7 agents compile
- Each agent importable from `src/agents/index.ts`
