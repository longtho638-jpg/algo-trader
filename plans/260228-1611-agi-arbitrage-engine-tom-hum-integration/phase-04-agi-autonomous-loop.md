# Phase 04: AGI Autonomous Loop

## Context Links
- [Phase 01 - Scanner](./phase-01-arbitrage-scanner.md) -- ArbitrageScanner class
- [Phase 03 - Tom Hum Integration](./phase-03-tom-hum-integration.md) -- task file dispatch
- [auto-cto-pilot.js](../../../openclaw-worker/lib/auto-cto-pilot.js) -- existing auto-task generator
- [task-watcher.js](../../../openclaw-worker/task-watcher.js) -- main orchestrator boot sequence
- [config.js](../../../openclaw-worker/config.js) -- PROJECTS includes 'algo-trader'

## Overview
- **Priority**: P2
- **Status**: pending
- **Description**: Create a lightweight arbitrage watcher module in openclaw-worker that spawns the algo-trader scanner as a child process, monitors its health, and restarts on failure. This enables 24/7 autonomous operation under Tom Hum supervision.

## Key Insights
- Tom Hum already runs 24/7 as a daemon with crash recovery (brain-process-manager.js, brain-respawn-controller.js)
- Auto-CTO pilot generates quality tasks when queue is empty -- arb watcher is a DIFFERENT concern: it's a persistent background process, not a one-shot task
- Best approach: spawn `node dist/index.js arb-scan --dispatch` as a managed child process within Tom Hum
- Keep it simple: Tom Hum starts the scanner, monitors its stdout/health, restarts if it dies
- DO NOT merge scanner into Tom Hum's Node.js process -- keep algo-trader self-contained (YAGNI: no tight coupling)

## Requirements

### Functional
- New module `arbitrage-watcher.js` in openclaw-worker/lib/
- Spawns algo-trader `arb-scan` as child process with configurable args
- Monitors child process health (alive, producing output, no error spam)
- Restarts on crash with exponential backoff (1s, 2s, 4s, max 30s)
- Integrates with Tom Hum boot sequence (task-watcher.js)
- Configurable on/off via config.js flag
- Logs scanner events to Tom Hum unified log

### Non-functional
- Memory footprint < 50MB for scanner child process
- Max restart attempts per hour: 10 (then alert and stop)
- Graceful shutdown: forward SIGTERM to child on Tom Hum stop

## Architecture

```
task-watcher.js (Tom Hum main)
  |-- startWatching()
  |-- startAutoCTO()
  |-- startCooling()
  |-- startArbitrageWatcher()   <-- NEW
        |
        v
  arbitrage-watcher.js
    |-- spawn('node', ['dist/index.js', 'arb-scan', '--dispatch', '--interval', '10000'])
    |-- cwd: apps/algo-trader
    |-- monitor stdout for heartbeat lines
    |-- on 'exit': restart with backoff
    |-- on Tom Hum shutdown: kill child
```

## Related Code Files

### New Files
| File | Purpose | Lines |
|------|---------|-------|
| `apps/openclaw-worker/lib/arbitrage-watcher.js` | Managed child process for arb scanner | ~120 |

### Modified Files
| File | Change |
|------|--------|
| `apps/openclaw-worker/task-watcher.js` | Call `startArbitrageWatcher()` in boot sequence |
| `apps/openclaw-worker/config.js` | Add `ARBITRAGE_ENABLED`, `ARBITRAGE_SCAN_INTERVAL_MS`, `ARBITRAGE_DRY_RUN` flags |

## Implementation Steps

### Step 1: Add config flags to config.js
Add to `apps/openclaw-worker/config.js` inside the config object:

```javascript
// Arbitrage Watcher (v2026.2.28)
ARBITRAGE_ENABLED: process.env.ARB_ENABLED === 'true' || false,
ARBITRAGE_SCAN_INTERVAL_MS: parseInt(process.env.ARB_SCAN_INTERVAL || '10000'),
ARBITRAGE_DRY_RUN: process.env.ARB_DRY_RUN !== 'false',  // default true (safe)
ARBITRAGE_DISPATCH_TASKS: process.env.ARB_DISPATCH === 'true' || false,
ARBITRAGE_MAX_RESTARTS_PER_HOUR: 10,
ARBITRAGE_SCANNER_DIR: path.join(MEKONG_DIR, 'apps', 'algo-trader'),
```

### Step 2: Create arbitrage-watcher.js
File: `apps/openclaw-worker/lib/arbitrage-watcher.js`

```javascript
const { spawn } = require('child_process');
const path = require('path');
const config = require('../config');
const { log } = require('./brain-logger');  // reuse existing logger

class ArbitrageWatcher {
  constructor() {
    this.child = null;
    this.restartCount = 0;
    this.restartTimestamps = [];  // track restarts per hour
    this.backoffMs = 1000;
    this.isShuttingDown = false;
  }

  start() {
    if (!config.ARBITRAGE_ENABLED) {
      log('[ARB-WATCHER] Disabled via config. Skipping.');
      return;
    }
    log('[ARB-WATCHER] Starting arbitrage scanner...');
    this._spawn();
  }

  stop() {
    this.isShuttingDown = true;
    if (this.child) {
      log('[ARB-WATCHER] Stopping scanner child process...');
      this.child.kill('SIGTERM');
      // Force kill after 5s if still alive
      setTimeout(() => {
        if (this.child && !this.child.killed) {
          this.child.kill('SIGKILL');
        }
      }, 5000);
    }
  }

  _spawn() {
    const args = ['dist/index.js', 'arb-scan'];
    if (config.ARBITRAGE_DRY_RUN) args.push('--dry-run');
    if (config.ARBITRAGE_DISPATCH_TASKS) args.push('--dispatch');
    args.push('--interval', String(config.ARBITRAGE_SCAN_INTERVAL_MS));

    this.child = spawn('node', args, {
      cwd: config.ARBITRAGE_SCANNER_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    this.child.stdout.on('data', (data) => {
      const line = data.toString().trim();
      if (line) log(`[ARB-SCANNER] ${line}`);
    });

    this.child.stderr.on('data', (data) => {
      log(`[ARB-SCANNER:ERR] ${data.toString().trim()}`);
    });

    this.child.on('exit', (code) => {
      if (this.isShuttingDown) return;
      log(`[ARB-WATCHER] Scanner exited with code ${code}. Scheduling restart...`);
      this._scheduleRestart();
    });

    this.backoffMs = 1000; // reset backoff on successful spawn
    log(`[ARB-WATCHER] Scanner spawned (PID: ${this.child.pid})`);
  }

  _scheduleRestart() {
    // Prune restarts older than 1 hour
    const oneHourAgo = Date.now() - 3600000;
    this.restartTimestamps = this.restartTimestamps.filter(t => t > oneHourAgo);

    if (this.restartTimestamps.length >= config.ARBITRAGE_MAX_RESTARTS_PER_HOUR) {
      log('[ARB-WATCHER] Max restarts/hour reached. Stopping watcher. Manual intervention needed.');
      return;
    }

    this.restartTimestamps.push(Date.now());
    log(`[ARB-WATCHER] Restarting in ${this.backoffMs}ms...`);

    setTimeout(() => {
      if (!this.isShuttingDown) this._spawn();
    }, this.backoffMs);

    this.backoffMs = Math.min(this.backoffMs * 2, 30000); // cap at 30s
  }

  getStatus() {
    return {
      enabled: config.ARBITRAGE_ENABLED,
      running: this.child !== null && !this.child.killed,
      pid: this.child?.pid || null,
      restartCount: this.restartTimestamps.length,
      dryRun: config.ARBITRAGE_DRY_RUN
    };
  }
}

// Singleton
let instance = null;
function getArbitrageWatcher() {
  if (!instance) instance = new ArbitrageWatcher();
  return instance;
}

module.exports = { ArbitrageWatcher, getArbitrageWatcher };
```

### Step 3: Wire into task-watcher.js boot sequence
Add to `apps/openclaw-worker/task-watcher.js` in the main boot function:

```javascript
const { getArbitrageWatcher } = require('./lib/arbitrage-watcher');

// In boot sequence, after startAutoCTO() and startCooling():
function startArbitrageWatcher() {
  const watcher = getArbitrageWatcher();
  watcher.start();
}

// In shutdown handler:
function shutdown() {
  getArbitrageWatcher().stop();
  // ... existing shutdown logic
}
```

### Step 4: Add scanner heartbeat to arb-scan CLI
In algo-trader `arb-scan` command, add periodic heartbeat log so watcher can detect stalls:

```typescript
// In scanner loop, after each scan cycle:
logger.info(`[HEARTBEAT] scan cycle complete | ${opportunities.length} opportunities | ${Date.now()}`);
```

Watcher can optionally parse stdout for `[HEARTBEAT]` lines and restart if no heartbeat within N seconds. This is a future enhancement -- for v1, exit code monitoring is sufficient.

## Todo List
- [ ] Add arbitrage config flags to `apps/openclaw-worker/config.js`
- [ ] Create `apps/openclaw-worker/lib/arbitrage-watcher.js`
- [ ] Wire `startArbitrageWatcher()` into `task-watcher.js` boot + shutdown
- [ ] Add heartbeat logging to `arb-scan` CLI command
- [ ] Test: watcher starts/stops scanner child process correctly
- [ ] Test: exponential backoff on crash recovery

## Success Criteria
- Tom Hum starts scanner on boot when ARBITRAGE_ENABLED=true
- Scanner crash triggers automatic restart with backoff
- Max 10 restarts/hour before circuit break
- Graceful shutdown kills scanner child on Tom Hum stop
- Scanner runs indefinitely in dry-run mode without intervention

## Risk Assessment
- **Zombie processes**: `child.kill('SIGKILL')` fallback after 5s prevents zombies
- **Resource exhaustion**: Scanner is lightweight (polling HTTP, no WebSocket). M1 cooling daemon monitors overall system load
- **Config drift**: All arb config in config.js single source of truth, env vars for runtime override
- **Build required**: Scanner must be compiled (`tsc`) before watcher can spawn `dist/index.js`. Add build check in watcher start

## Next Steps
- Phase 05 adds integration tests for the full loop: scanner -> task file -> Tom Hum pickup -> execute
