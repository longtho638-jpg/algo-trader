# Cloudflare Migration Phase 7-8 + AGI SOPs Plan

**Created:** 2026-03-12 | **Status:** Ready for implementation

---

## Execution Strategy

**Phases 1-3 Parallel** → **Phase 4 (depends on 3)**

---

## Phases Overview

| Phase | Title | Parallel | Status |
|-------|-------|----------|--------|
| 01 | Enable R2 Buckets (Manual + CLI) | ✅ Independent | Pending |
| 02 | Implement Queue Consumers | ✅ Independent | Pending |
| 03 | Create Trading SOPs | ✅ Independent | Pending |
| 04 | Test AGI SOPs with Ollama | ❌ Depends on 03 | Pending |

---

## Dependency Graph

```
Phase 01 ──┐
           │
Phase 02 ──┼──→ Phase 04 (Test)
           │
Phase 03 ──┘
```

---

## File Ownership Matrix

| Phase | Files Modified |
|-------|----------------|
| 01 | `wrangler.toml` (R2 bindings) |
| 02 | `src/api/gateway.ts` (queue handler) |
| 03 | `sops/*.json` (new SOP definitions) |
| 04 | `src/agi-sops/*` (test scripts) |

---

## Phase Files

- [Phase 01](./phase-01-r2-buckets.md) - Enable R2 via dashboard + create buckets
- [Phase 02](./phase-02-queue-consumers.md) - Implement queue() handler in gateway.ts
- [Phase 03](./phase-03-trading-sops.md) - Create trading SOP definitions
- [Phase 04](./phase-04-ollama-test.md) - Test SOPs with local Ollama

---

**Next:** Review plan → `/cook` to execute
