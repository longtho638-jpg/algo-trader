# Phase 2: SOP Engine

**Created:** 2026-03-11
**Priority:** P0
**Status:** Pending
**Owner:** Backend

---

## Context Links

- Parent Plan: [plan.md](./plan.md)
- Research: [reports/researcher-02-openclaw-sop-patterns.md](../reports/researcher-02-openclaw-sop-patterns.md)

---

## Overview

Build SOP engine that executes rule-based + LLM decisions.

| Attribute | Value |
|-----------|-------|
| ETA | 3 hours |
| Priority | P0 |
| Status | Pending |

---

## Requirements

**Functional:**
- Load SOP definitions from YAML
- Execute triggers (IF conditions)
- Call LLM for unclear decisions
- Extract structured output (BUY/SELL/HOLD + confidence)

**Non-Functional:**
- Decision latency < 500ms
- Support concurrent SOP execution
- Audit trail for all decisions

---

## Implementation Steps

1. Define SOP schema (Zod)
2. Create SOP loader (YAML → JSON)
3. Implement trigger evaluator
4. Implement LLM decision caller
5. Create decision parser (extract action + confidence)
6. Add audit logging
7. Write unit tests

---

## Todo List

- [ ] Define SOP schema
- [ ] Create SOP loader
- [ ] Implement trigger evaluator
- [ ] Implement LLM decision
- [ ] Create decision parser
- [ ] Add audit logging
- [ ] Write tests

---

## Success Criteria

```typescript
// Must work:
const sop = await SOPEngine.load('agi-signal-001');
const decision = await sop.evaluate(signal);
// decision = { action: 'BUY', confidence: 0.78, reasoning: '...' }
```

---

## Related Files

- Create: `src/agi/engine/sop-engine.ts`
- Create: `src/agi/types/sop.types.ts`
- Create: `src/agi/configs/sop-definitions.yaml`
- Create: `src/agi/engine/trigger-evaluator.ts`
- Create: `src/agi/engine/decision-parser.ts`

---

## Next Steps

→ Proceed to [Phase 3: Safety Circuits](./phase-03-safety-circuits.md)
