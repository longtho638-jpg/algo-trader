# Phase 03: Tom Hum Integration

## Context Links
- [Phase 01 - Scanner](./phase-01-arbitrage-scanner.md) -- emits `opportunity` events
- [Phase 02 - Executor](./phase-02-arbitrage-executor.md) -- executes trades
- [openclaw-worker config](../../../openclaw-worker/config.js) -- `algo-trader` already registered at line 117
- [mission-dispatcher.js](../../../openclaw-worker/lib/mission-dispatcher.js) -- keyword routing
- [task-queue.js](../../../openclaw-worker/lib/task-queue.js) -- TASK_PATTERN regex, priority sorting
- [CLI index.ts](../../src/index.ts) -- Commander.js, existing `backtest` and `live` commands

## Overview
- **Priority**: P1
- **Status**: pending
- **Description**: Bridge algo-trader scanner to Tom Hum daemon via task files. Add CLI commands for arbitrage scanning and execution.

## Key Insights
- Tom Hum TASK_PATTERN: `/^(?:CRITICAL_|HIGH_|MEDIUM_|LOW_)?(?:mission_)?.+\.txt$/`
- Priority prefix determines queue order: CRITICAL_ > HIGH_ > MEDIUM_ > LOW_
- Keyword `algo-trader` routes to `apps/algo-trader` (already in config.js line 117)
- Mission dispatcher builds CC CLI prompts using ClaudeKit commands
- For arbitrage, we want DIRECT EXECUTION via CLI (not CC CLI prompt injection) -- Tom Hum can call `node dist/index.js arb-execute <opportunity-json>`
- Task file format: `HIGH_mission_algo_trader_arb_{pair}_{timestamp}.txt`

## Requirements

### Functional
- ArbitrageTaskDispatcher listens to scanner `opportunity` events
- Writes task files to `mekong-cli/tasks/` directory following Tom Hum format
- Task file content includes opportunity JSON + execution command
- New CLI command `arb-scan` for continuous scanning mode
- New CLI command `arb-execute --opportunity <json>` for single opportunity execution
- Configurable: dispatch to Tom Hum vs direct execution vs both

### Non-functional
- Atomic file writes (write to .tmp then rename) to prevent partial reads
- Deduplication: don't create duplicate task for same opportunity within TTL
- Task files include priority based on profit magnitude

## Architecture

```
ArbitrageScanner
  |-- emits 'opportunity'
  |
  v
ArbitrageTaskDispatcher
  |-- dedup check (Map<string, timestamp>)
  |-- priority mapping:
  |     netProfit > 1%  -> CRITICAL_
  |     netProfit > 0.5% -> HIGH_
  |     netProfit > 0.2% -> MEDIUM_
  |     else             -> LOW_
  |-- atomic write to tasks/ dir
  |
  v
tasks/HIGH_mission_algo_trader_arb_BTC_USDT_1709136000.txt
  |
  v (Tom Hum picks up)
mission-dispatcher.js
  |-- routes to apps/algo-trader
  |-- dispatches: node dist/index.js arb-execute --opportunity '{"...json..."}'
```

## Related Code Files

### New Files
| File | Purpose | Lines |
|------|---------|-------|
| `src/arbitrage/arbitrage-task-dispatcher.ts` | Writes task files for Tom Hum | ~100 |

### Modified Files
| File | Change |
|------|--------|
| `src/index.ts` | Add `arb-scan` and `arb-execute` CLI commands |
| `apps/openclaw-worker/lib/mission-dispatcher.js` | Add arb-specific command template for algo-trader arb tasks |

## Implementation Steps

### Step 1: Create ArbitrageTaskDispatcher
File: `src/arbitrage/arbitrage-task-dispatcher.ts`

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { IArbitrageOpportunity } from '../interfaces/IArbitrageOpportunity';
import { logger } from '../utils/logger';

export interface TaskDispatcherConfig {
  tasksDir: string;           // default: path to mekong-cli/tasks/
  deduplicationTtlMs: number; // default: 30000 (30s) -- same pair+exchanges
  enabled: boolean;
}

export class ArbitrageTaskDispatcher {
  private config: TaskDispatcherConfig;
  private recentDispatches: Map<string, number> = new Map(); // dedupKey -> timestamp

  constructor(config: TaskDispatcherConfig)

  dispatch(opportunity: IArbitrageOpportunity): boolean {
    // 1. Build dedup key: `${symbol}_${buyExchange}_${sellExchange}`
    // 2. Check TTL -- skip if same opportunity dispatched within TTL
    // 3. Determine priority prefix from netProfitPercent
    // 4. Build filename: `${priority}mission_algo_trader_arb_${safePair}_${timestamp}.txt`
    // 5. Build content: execution command + opportunity JSON
    // 6. Atomic write: write to .tmp, rename to .txt
    // 7. Update recentDispatches map
    // 8. Clean expired entries from map
    // return true if dispatched, false if deduped
  }

  private getPriorityPrefix(netProfitPercent: number): string {
    if (netProfitPercent > 1.0) return 'CRITICAL_';
    if (netProfitPercent > 0.5) return 'HIGH_';
    if (netProfitPercent > 0.2) return 'MEDIUM_';
    return 'LOW_';
  }

  private buildTaskContent(opp: IArbitrageOpportunity): string {
    // Template:
    // /cook algo-trader arb-execute for {symbol}
    // Buy on {buyExchange} @ {buyPrice}, Sell on {sellExchange} @ {sellPrice}
    // Net profit: {netProfitPercent}%
    // Opportunity JSON: {serialized}
    // Command: cd apps/algo-trader && node dist/index.js arb-execute --opportunity '{json}'
  }

  private cleanExpired(): void {
    // Remove entries older than TTL
  }
}
```

Task file content example:
```
/cook algo-trader arbitrage execution for BTC/USDT
Buy on binance @ 67450.50, Sell on bybit @ 67585.20
Net profit: 0.20% (~$0.20 on $100 position)
Spread: 0.20% | Fees: 0.10% + 0.10% | Slippage: 0.05%

Command: cd apps/algo-trader && node dist/index.js arb-execute --opportunity '{"id":"arb-1709136000","symbol":"BTC/USDT","buyExchange":"binance","sellExchange":"bybit","buyPrice":67450.50,"sellPrice":67585.20,"netProfitPercent":0.20}'
```

### Step 2: Add CLI commands to index.ts
Add to `src/index.ts`:

```typescript
program
  .command('arb-scan')
  .description('Start continuous arbitrage scanner')
  .option('-c, --config <path>', 'Arbitrage config file', 'config/arbitrage.yaml')
  .option('--dry-run', 'Log opportunities without executing', true)
  .option('--dispatch', 'Write task files for Tom Hum', false)
  .option('--interval <ms>', 'Scan interval in ms', '10000')
  .action(async (options) => {
    // 1. Load ArbitrageConfig from file or defaults
    // 2. Create ExchangeClient instances
    // 3. Create ArbitrageScanner
    // 4. Optionally wire ArbitrageTaskDispatcher
    // 5. Optionally wire ArbitrageExecutor (if not dry-run)
    // 6. scanner.on('opportunity', handler)
    // 7. await scanner.start()
    // 8. Handle SIGINT/SIGTERM
  });

program
  .command('arb-execute')
  .description('Execute a specific arbitrage opportunity')
  .requiredOption('--opportunity <json>', 'Opportunity JSON string')
  .option('--dry-run', 'Simulate execution', false)
  .action(async (options) => {
    // 1. Parse opportunity JSON
    // 2. Create ExchangeClient instances for buy+sell exchanges
    // 3. Create ArbitrageExecutor
    // 4. Execute opportunity
    // 5. Log result
  });
```

### Step 3: Update mission-dispatcher.js (minimal)
In `apps/openclaw-worker/lib/mission-dispatcher.js`, add arb-specific handling in the prompt builder.

When task filename matches `arb_` pattern, extract the embedded command directly instead of wrapping in `/cook`:

```javascript
// Inside buildPrompt() or equivalent:
if (taskContent.includes('arb-execute --opportunity')) {
  // Extract the direct command line from task content
  const cmdMatch = taskContent.match(/Command: (.+)$/m);
  if (cmdMatch) {
    return cmdMatch[1]; // Direct execution, no /cook wrapper
  }
}
// Fallback to normal /cook routing
```

This is a MINIMAL change -- the dispatcher already routes `algo-trader` keyword correctly. We just optimize the prompt to use direct CLI execution instead of CC CLI interpretation.

## Todo List
- [ ] Create `src/arbitrage/arbitrage-task-dispatcher.ts`
- [ ] Add `arb-scan` command to `src/index.ts`
- [ ] Add `arb-execute` command to `src/index.ts`
- [ ] Update `apps/openclaw-worker/lib/mission-dispatcher.js` for arb command extraction
- [ ] Create `config/arbitrage.example.yaml` with documented defaults
- [ ] Add `.env.example` entries for exchange API keys

## Success Criteria
- `arb-scan` starts scanner and logs detected opportunities
- `arb-scan --dispatch` writes correctly formatted task files to `tasks/`
- Task files picked up by Tom Hum within poll interval (100ms per config)
- `arb-execute --opportunity '{json}'` executes trade or dry-run correctly
- Deduplication prevents duplicate tasks for same opportunity within TTL

## Risk Assessment
- **Task file race condition**: Atomic write (tmp+rename) prevents partial reads by Tom Hum
- **Stale opportunities**: By the time Tom Hum processes task, price may have moved. The executor re-fetches current prices before executing (Phase 02 handles this)
- **Disk space**: Task files are small (~500 bytes). Processed/ archival by Tom Hum prevents accumulation

## Security Considerations
- Task files contain exchange names and prices but NO API keys
- Opportunity JSON does not include credentials
- `.env` with API keys excluded from git

## Next Steps
- Phase 04 creates the autonomous 24/7 scanning loop in openclaw-worker
- Phase 05 tests the full dispatcher -> task file -> execute pipeline
