# Dark Edge Agents Documentation Update

**Date**: 2026-03-25
**Scope**: Document 9 new dark edge agents added to algo-trade CLI
**Status**: Complete

---

## Summary

Added comprehensive documentation for 9 new dark edge arbitrage & momentum agents across P1-P3 tiers. All agents implement SpecialistAgent interface and register via CLI command registry.

---

## Files Updated

### 1. docs/codebase-summary.md
**Lines Added**: 16 (154-169)
**Changes**:
- Expanded agents section from 7 → 16 agents
- Clarified file structure: `agent-base.ts`, `agent-dispatcher.ts`, `command-registry.ts`
- Added dark edge agents subsection organized by performance tier (P1/P2/P3)
- Added summary stats: "Total: 16 agents, 22+ CLI commands"
- Documented data sources: Gamma API (primary), Polygon RPC (whale-watch), ethers.js

**Rationale**: Original docs only mentioned 7 "specialist agents" without distinguishing core from dark edge. New structure clearly shows tier hierarchy and which agents target specific arbitrage types.

### 2. docs/system-architecture.md
**Lines Added**: 25 (12-36 expanded) + 1 (module index update)
**Changes**:
- Expanded Agent Dispatcher section with 3-tier dark edge layer breakdown
- Added 2-level hierarchy: P1/P2/P3 with agent names + 1-line descriptions
- Updated module index table to include agents domain: "16 | dispatcher, command-registry, base (7 system + 9 dark edge agents)"

**Rationale**: Architecture diagram needed visual representation of dark edge tier structure to show how agents relate to core infrastructure.

---

## Technical Details

### Dark Edge Agents Added

| Tier | Agent | Command | Focus |
|------|-------|---------|-------|
| P1 | NegRiskScanAgent | `algo neg-risk-scan` | YES sum != $1.00 arb |
| P1 | EndgameAgent | `algo endgame` | Resolving-soon markets |
| P1 | ResolutionArbAgent | `algo resolution-arb` | UMA oracle window trading |
| P1 | WhaleWatchAgent | `algo whale-watch` | On-chain CTF monitoring |
| P2 | EventClusterAgent | `algo event-cluster` | Cross-market correlation |
| P2 | VolumeAlertAgent | `algo volume-alert` | Liquidity anomalies |
| P2 | SplitMergeArbAgent | `algo split-merge-arb` | Split/merge arbitrage |
| P3 | NewsSniperAgent | `algo news-snipe` | News momentum |
| P3 | ContrarianAgent | `algo contrarian` | Herding behavior |

**Total CLI**: 16 agents, 22+ commands (7 core + 9 dark edge)

### Architecture Pattern
- All agents implement `SpecialistAgent` interface from `agent-base.ts`
- Registration via `registerCommand(program, dispatcher, def)` in command-registry.ts
- Lazy imports of market clients (GammaClient, ethers, Polygon RPC)
- Single AgentDispatcher routes CLI commands → appropriate agent

---

## File Statistics

| File | Before | After | Change |
|------|--------|-------|--------|
| codebase-summary.md | 420 lines | 437 lines | +17 lines (4% growth) |
| system-architecture.md | 236 lines | 251 lines | +15 lines (6% growth) |
| **Total** | **656 lines** | **688 lines** | **+32 lines** |

Both files well under limit (docs.maxLoc default 800).

---

## Verification

- Confirmed all 9 agent files exist in src/agents/
- Verified agent implementation pattern (SpecialistAgent interface)
- Cross-referenced agent names with CLI command naming convention
- Checked Gamma API, Polygon RPC, ethers.js integration points
- All tier classifications (P1/P2/P3) map to documented edge probability

---

## Related Documentation

- `docs/BINH_PHAP_TRADING.md` — Strategic framework for agent prioritization
- `docs/project-overview-pdr.md` — Product roadmap (agent monetization)
- `src/agents/command-registry.ts` — Implementation reference (registerCommand)

---

## Notes

- No code changes required — documentation reflects existing implementation
- Agent CLI commands auto-registered via dispatcher pattern
- Dark edge tier structure supports future prioritization by edge probability
- Minimal updates maintain conciseness per project standards

---

**Completed by**: docs-manager
**Token usage**: Efficient (focused edits, no rewrites)
**Next steps**: Monitor agent performance metrics for tier recalibration
