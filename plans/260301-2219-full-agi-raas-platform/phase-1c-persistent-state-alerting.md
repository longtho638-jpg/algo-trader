# Phase 1C: Persistent State + Alert Rules Engine

## Overview
JSON file persistence for tenant state + configurable alert rules engine.
Replaces in-memory Map with durable storage. Alerts broadcast via SignalMesh.

## Requirements
- Save/load tenant state to JSON file
- Auto-save on state change (debounced 5s)
- Alert rules: threshold-based (drawdown, loss, position count)
- Alert actions: log, webhook, WS broadcast

## Files to Create
- `src/core/persistent-tenant-state-store.ts` (max 120 lines)
- `src/core/persistent-tenant-state-store.test.ts` (max 100 lines)
- `src/core/alert-rules-engine.ts` (max 120 lines)
- `src/core/alert-rules-engine.test.ts` (max 100 lines)

## Persistent State Store
```
load(filePath) → Map<tenantId, TenantState>
save(filePath, state) → write JSON atomically (write tmp + rename)
autoSave(interval) → debounced periodic flush
```

## Alert Rules Engine
```ts
interface AlertRule {
  id: string;
  metric: 'drawdown_pct' | 'daily_loss_usd' | 'open_positions' | 'win_rate';
  operator: 'gt' | 'lt' | 'gte' | 'lte';
  threshold: number;
  action: 'log' | 'webhook' | 'ws_broadcast';
  cooldownMs: number; // prevent alert spam
}
```

```
evaluate(rules, tenantState) → triggered alerts[]
  for each rule:
    extract metric value from state
    compare with threshold using operator
    if triggered AND not in cooldown → emit alert
```

## Implementation
- fs.writeFileSync for atomic save (write to .tmp, rename)
- Zod schema for AlertRule validation
- Map<ruleId, lastTriggered> for cooldown tracking
- No external deps (pure Node fs + path)

## Success Criteria
- [x] State persists across restarts
- [x] Atomic write prevents corruption
- [x] Alert rules evaluate correctly
- [x] Cooldown prevents spam
- [x] Tests cover file I/O + rule evaluation
- [x] TypeScript strict, 0 errors

## Implementation Status: COMPLETE
- 22 tests passed, 0 failures
- tsc --noEmit: 0 errors
