# Research: Algo-Trade CLI Architecture (Mekong-style)

**Date:** 2026-03-24 | **Sources:** 4 Gemini searches + mekong-cli codebase analysis

---

## Executive Summary

Best approach: **Commander.js** (mature, 48K stars) for command registration + custom **AgentDispatcher** pattern (from mekong-cli) + **launchd/PM2** daemon mode. Freqtrade (48K stars) is the gold standard for trading CLI architecture. Our existing 5 commands need expansion to ~15-20 for Mekong-parity.

---

## 1. Framework Comparison

| Framework | Stars | Subcommands | Plugins | Daemon | Pick? |
|-----------|-------|-------------|---------|--------|-------|
| Commander.js | 48K | Native | No | Manual | **YES** — already used in algo-trade |
| yargs | 11K | Native | No | Manual | No — verbose API |
| oclif | 9K | Native | Yes | Manual | Overkill — Salesforce enterprise |
| citty | 1K | Native | No | Manual | No — too new, small community |
| clipanion | 1K | Native | No | Manual | No — Yarn-specific |

**Decision: Stay with Commander.js** — already in project, battle-tested, Freqtrade-style subcommand pattern.

---

## 2. Trading CLI Benchmarks

| Bot | Stars | Commands | Architecture | Key Pattern |
|-----|-------|----------|-------------|-------------|
| Freqtrade | 48K | ~15 | Python, modular strategies | `freqtrade <cmd>` — our model |
| Hummingbot | 17.8K | Interactive | Python, Scripts+Controllers | Pane-based TUI |
| CCXT | 41K | Library | JS/Python/PHP | Not a CLI, API only |
| Jesse | Archived | ~5 | Python, TensorFlow | Shifted to GUI |

**Key insight:** Freqtrade's command structure = best match for solo startup trading CLI.

### Freqtrade Commands (our reference):
```
freqtrade trade         # Live/dry-run trading
freqtrade backtesting   # Backtest strategies
freqtrade hyperopt      # Optimize parameters
freqtrade download-data # Fetch market data
freqtrade show-config   # Display config
freqtrade list-exchanges
freqtrade list-strategies
freqtrade test-pairlist
```

---

## 3. Agent Dispatcher Pattern (Mekong-style)

### Architecture
```
CLI Command → AgentDispatcher → SpecialistAgent → Result
                    ↓
              1 LLM Brain (DeepSeek R1)
              routes by task.type
```

### TypeScript Implementation Pattern:
```typescript
interface AgentTask {
  id: string;
  type: 'scan' | 'estimate' | 'execute' | 'monitor' | 'research' | 'risk';
  payload: Record<string, unknown>;
}

interface SpecialistAgent {
  name: string;
  canHandle(task: AgentTask): boolean;
  execute(task: AgentTask): Promise<AgentResult>;
}

class AgentDispatcher {
  private agents: SpecialistAgent[] = [];
  register(agent: SpecialistAgent) { this.agents.push(agent); }
  async dispatch(task: AgentTask): Promise<AgentResult[]> {
    for (const agent of this.agents) {
      if (agent.canHandle(task)) return [await agent.execute(task)];
    }
    throw new Error(`No agent for task type: ${task.type}`);
  }
}
```

### Mekong CLI Specifics (from codebase scan):
- 180 core modules, 13 agents, 48 commands
- `agent_dispatcher.py`: Routes by role (cto/cfo/cmo/coo)
- `command_registry.py`: Dynamic command registration
- Hub system: Domain knowledge injected per agent role
- AGI loop: Autonomous task execution cycle

---

## 4. Daemon Mode Best Practices

| Method | Complexity | Reliability | Best For |
|--------|-----------|-------------|----------|
| `child_process.fork()` | Low | Medium | Dev/testing |
| PM2 | Medium | High | Production Linux |
| launchd (macOS) | Low | High | **M1 Max — ALREADY USING** |
| systemd (Linux) | Low | High | VPS deployment |

**Decision: Keep launchd** for M1 Max (already set up). Add PM2 for future VPS.

---

## 5. Recommended Command Structure for algo-trade

### Phase 1 (Immediate — wrap existing code):
```bash
algo trade [--dry-run] [--capital N]    # Start bot (existing start.ts)
algo scan [--category X] [--limit N]    # Market scanner
algo status                              # System health
algo monitor [--json] [--watch]          # KPI dashboard
algo config [get|set] <key> [value]     # Config management
```

### Phase 2 (1 week — new agents):
```bash
algo estimate <question>    # Single market probability estimate
algo research <market-id>   # Deep analysis with DeepSeek R1
algo calibrate              # Run calibration tuner on resolved trades
algo report [--daily]       # PnL + performance report
algo risk                   # Portfolio risk assessment
```

### Phase 3 (2 weeks — automation):
```bash
algo agi [--hours 24]       # Autonomous trading loop
algo deploy [--target m1max] # Push + build + restart
algo doctor                 # Full system health check
algo backtest <strategy>    # Backtest with historical data
```

---

## 6. Config Management

**Freqtrade pattern (proven):**
```
Precedence: CLI args > ENV vars > config.json > defaults

algo-trade/
├── config/
│   ├── default.json       # Defaults (committed)
│   ├── production.json    # Production overrides
│   └── local.json         # Local overrides (gitignored)
└── .env                   # Secrets (gitignored)
```

Already using `.env` + inline defaults. Add `config/` directory for structured config.

---

## 7. Implementation Plan

| Step | What | Effort | Files |
|------|------|--------|-------|
| 1 | AgentDispatcher + AgentBase | 0.5 day | `src/agents/dispatcher.ts`, `src/agents/base.ts` |
| 2 | Wrap existing code as agents | 1 day | `src/agents/scanner.ts`, `src/agents/executor.ts`, etc |
| 3 | Command registry (Commander.js) | 0.5 day | `src/cli/command-registry.ts` |
| 4 | New commands (scan, monitor, estimate) | 1 day | `src/cli/commands/*.ts` |
| 5 | AGI loop command | 1 day | `src/agents/agi-loop.ts`, `src/cli/commands/agi.ts` |
| 6 | Report + calibrate commands | 0.5 day | `src/cli/commands/report.ts` |
| 7 | Doctor + deploy commands | 0.5 day | `src/cli/commands/doctor.ts` |

**Total: ~5 days** for full Mekong-style CLI.

---

## Unresolved Questions

1. Should `algo` be a global npm binary or local `npx algo`?
2. Interactive mode (hummingbot-style TUI) worth the effort for solo startup?
3. Should agents communicate via EventBus or direct function calls?
4. Config: JSON vs YAML vs TOML? (JSON = simplest, YAML = most readable)
