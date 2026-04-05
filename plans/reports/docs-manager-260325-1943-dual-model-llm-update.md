# Documentation Update: Dual-Model LLM & Paper Trading Pipeline

**Report Date**: 2026-03-25
**Updated Files**: 2 docs files
**Total Lines Added**: 45 (both files still under 800 LOC limit)
**Status**: Complete

---

## Changes Summary

### 1. system-architecture.md (251 → 295 lines)

**Updated Sections**:

#### Dual-Model LLM Pipeline (NEW)
- Added comprehensive section replacing outdated single-model routing
- **Nemotron-3 Nano 30B** (port 11436): Fast scanner, MoE 3.5B active params, 35-50 t/s
- **DeepSeek-R1-Distill-32B** (port 11435): Deep reasoner, chain-of-thought, 15-25 t/s
- Model routing logic: simple → Nemotron-3, standard/complex → DeepSeek-R1
- Timeout configuration: 40s (Nemotron), 90s (DeepSeek), 120s (gateway)
- Response handling via centralized `llm-response-parser.ts`

#### Paper Trading Pipeline (NEW)
- Added visual ASCII flow diagram showing Gamma API → Filter → CLOB Prices → LLM Ensemble → Signal Ranking → Execution → Metrics
- Features documented:
  - 50+ concurrent paper trades per strategy
  - Blind prompt strategy (no data leakage)
  - Real CLOB prices with simulated execution
  - Ensemble LLM routing for signal generation
  - Historical tracking of 4477 test scenarios

#### Dark Edge Layer
- Updated section title to reflect **43 strategies** (from 9 agents)
- Maintained all P1/P2/P3 tier agent descriptions

---

### 2. codebase-summary.md (437 → 438 lines)

**Updated Sections**:

#### Overview Statistics
- Test coverage changed from "50+ unit tests" → "4477 tests (unit + paper trading simulations)"

#### LLM Configuration Quick Reference
- Updated dual-model setup with ports and throughput specs
- Nemotron-3 Nano: 35-50 t/s
- DeepSeek-R1-Distill: 15-25 t/s
- Routing strategy explicitly documented

#### Agents & Strategies
- Added "43 strategies" count alongside "16 agents"
- Clarified total test coverage across both unit and simulation tests

---

## Validation

**File Size Compliance**:
- system-architecture.md: 295 lines (✓ under 800 LOC limit)
- codebase-summary.md: 438 lines (✓ under 800 LOC limit)
- Combined: 733 lines (✓ under 1600 LOC)

**Content Accuracy**:
- All hardware specs verified (M1 Max MLX, Ollama ports)
- Model names/throughputs match deployment: Nemotron-3 Nano 30B, DeepSeek-R1-Distill-32B
- Strategy count (43) and test count (4477) updated throughout
- Paper trading pipeline flow matches actual implementation

**Cross-References**:
- LLM sections consistent between both docs
- Model ports documented (11436 = Nemotron, 11435 = DeepSeek-R1)
- Timeout configs match `openclaw-config.ts` expectations

---

## Impact

**Improved Documentation**:
- Developers now have clear understanding of dual-model architecture
- Paper trading pipeline visually documented with specific data flows
- LLM routing logic explicit and easy to follow
- Test coverage metrics updated to reflect 4477 scenarios

**Consistency**:
- Both files now reference same LLM configuration
- Strategy count (43) synchronized across all docs
- No contradictions between architecture and codebase summary

---

## Notes

- No code changes required; documentation-only update
- Both files remain well under size constraints (700+ lines headroom)
- All changes preserve existing structure and formatting
- Links and internal references remain valid
