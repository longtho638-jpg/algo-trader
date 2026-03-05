# Research: Tôm Hùm Task File IPC Protocol

**Date**: 2026-02-28
**Context**: Tôm Hùm daemon autonomous task dispatch for algo-trader integration

---

## 1. Task File Naming Convention

**Pattern**: `[PRIORITY_]mission_[PROJECT]_[CONTENT]_[TIMESTAMP].txt`

**Priority Prefixes** (highest → lowest):
- `CRITICAL_` — P0, AGI/security/production-down
- `HIGH_` — P1, complex/multi-file/architecture
- `MEDIUM_` — P2, routine fixes/features
- `LOW_` — P3, maintenance
- (none) — P4, lowest priority

**Routing Detection** (in order):
1. **Filename keyword match** (e.g., `mission_algo_trader_*` → `/apps/algo-trader`)
2. **Content keyword match** (e.g., "algo-trader" in task text)
3. **Iron Focus fallback** (if config.PROJECTS set, uses first project)

**Route Table** (mission-dispatcher.js):
```
'algo-trader' → 'apps/algo-trader'
'well' → 'apps/well'
'apex-os' → 'apps/apex-os'
```

---

## 2. File Content Format

Plain text file containing the task prompt/mission. Format:
- Line 1+: Raw task description (Vietnamese preferred)
- Optional: ClaudeKit command prefix (e.g., `/cook "task"`, `/plan:hard "task"`)
- Optional: Binh Pháp reference (e.g., `[Chapter 3]` for cost optimization)

**Example**:
```
CRITICAL_mission_algo_trader_fix_arbitrage_1709292000.txt
Content:
/cook "Fix cross-exchange arbitrage timeout — verify price feeds, optimize queue, stress-test with 1K events/s"
```

---

## 3. Priority System & Sorting

**Queue Sorting** (task-queue.js):
```javascript
getPriority(filename) {
  CRITICAL_ → 0
  HIGH_    → 1
  MEDIUM_  → 2
  LOW_     → 3
  (none)   → 4
}
```

**Dual-Stream Execution**: Max 2 concurrent missions (P0 + P1), queue 3rd until slot free.

---

## 4. Processing Lifecycle

**State Machine** (auto-cto-pilot.js):

```
SCAN (120s interval)
  ↓ [build/lint/test errors found?]
  ├─ YES → FIX (15s interval)
  │         ├─ Generate fix missions → write .txt files to tasks/
  │         └─ Advance fixIndex until all queued
  ├─ NO → VERIFY (15s interval)
  │        ├─ Re-scan project
  │        ├─ GREEN → advance to next project
  │        └─ RED → back to FIX (max 3 cycles)
```

**Files Written During FIX Phase**:
```
${SEVERITY}_mission_${PROJECT}_fix_${TYPE}_${TIMESTAMP}.txt
```

---

## 5. Prompt Building & Routing

**buildPrompt() Logic** (mission-dispatcher.js):

1. Parse explicit command: `/cook "..."`, `/plan:hard "..."`, etc.
2. Strip verbose mandates (token optimization)
3. Route by intent:
   - `CI/CD` → `/plan:ci`
   - `BOOTSTRAP` → `/bootstrap --auto`
   - `TEST` → `/test`
   - `STRATEGIC` → `/plan:parallel` or `/plan:hard`
   - `DEFAULT` → `/plan:hard`

4. **Deep Task Detection**: "deep 10x" + Pro available → force `/plan:hard`

---

## 6. How to Create NEW Task Type for algo-trader

**Steps**:

1. **Add routing keyword** (mission-dispatcher.js line 112-125):
   ```javascript
   routes = {
     'algo-trader': 'apps/algo-trader',
     // ... existing
   };
   ```
   ✅ Already exists.

2. **Create task file** in `$MEKONG_DIR/tasks/`:
   ```bash
   echo "/cook \"Integration test: verify arbitrage engine with 10K events/s\"" > \
     /Users/macbookprom1/mekong-cli/tasks/HIGH_mission_algo_trader_integration_$(date +%s).txt
   ```

3. **Task-queue.js** detects → **mission-dispatcher.js** routes to `/apps/algo-trader` → **brain-process-manager.js** runs `/cook` via CC CLI.

4. **Post-execution**: task archived to `tasks/processed/`, result recorded in mission-journal.

---

## 7. Key Integration Points for algo-trader

| Component | File | Purpose |
|-----------|------|---------|
| **Watch Dir** | config.js | `WATCH_DIR = /tasks` |
| **Priority Sort** | task-queue.js | `getPriority(filename)` |
| **Project Router** | mission-dispatcher.js | `detectProjectDir()` + routes table |
| **Complexity** | mission-complexity-classifier.js | Timeout + agent-team selection |
| **Auto-CTO** | auto-cto-pilot.js | Generates fixes, dispatches as .txt |

---

## 8. Unresolved Questions

1. **Algo-trader custom complexity thresholds?** (config.COMPLEXITY: STRATEGIC_KEYWORDS, etc.)
2. **Dedicated algo-trader health scoring module?** (learning-engine.getProjectHealthScore)
3. **Integration with ClawWork economic tracker?** (clawwork-integration.generateEconomicMission)
