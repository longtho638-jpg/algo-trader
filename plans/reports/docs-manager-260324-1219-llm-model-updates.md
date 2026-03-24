# Documentation Update Report: LLM Model & Timeout Changes

**Date**: 2026-03-24
**Scope**: Updated docs for recent model switch (Qwen → DeepSeek R1), timeout increases, and new shared utilities
**Status**: Complete

---

## Changes Analyzed

| Item | Change | Impact |
|------|--------|--------|
| Default model | Qwen → DeepSeek R1 (standard/complex) | **Docs: Updated** |
| Response parsing | 6 LLM modules handle think blocks | **Docs: Updated** |
| Shared utility | New `src/lib/llm-response-parser.ts` | **Docs: Updated** |
| OpenClaw timeout | 60s → 120s | **Docs: Updated** |
| LLM config timeout | 30s → 90s (primary) | **Docs: Updated** |
| Monitoring script | New `check-batch-resolutions.mjs` | **Docs: Updated** |

---

## Documentation Updates Made

### 1. **system-architecture.md** (Updated)

**Changes**:
- Enhanced OpenClaw AI section to highlight DeepSeek R1 + think block handling
- Added new "LLM Integration & Response Parsing" section with:
  - Model routing (Simple: Qwen, Standard/Complex: DeepSeek R1)
  - Timeout config (Primary 90s, OpenClaw 120s, Cloud 60s)
  - Response handling with `llm-response-parser.ts` details
  - List of 6 LLM modules using shared parser
- Updated webhook server line to mention batch resolution checker
- Added scripts + lib to module index

**Lines**: 230 (was 206) — within limits

### 2. **codebase-summary.md** (Updated)

**Changes**:
- OpenClaw AI section now notes DeepSeek R1 usage in ai-router, think block handling in algorithm-tuner
- Added `openclaw-config.ts` timeout detail (120s, DeepSeek R1 default)
- New "Shared Utilities" subsection documenting `llm-response-parser.ts`
- Quick reference section now includes LLM Configuration with timeout matrix

**Lines**: 412 (was 405) — within limits

---

## Verification

✓ Both updated files remain under 800 LOC limit
✓ All references verified against actual codebase:
  - `src/lib/llm-response-parser.ts` — exists, handles DeepSeek `<think>` blocks
  - `src/openclaw/openclaw-config.ts` — 120s timeout confirmed (line 33)
  - `src/config/llm-config.ts` — 90s timeout confirmed (line 29)
  - All 6 LLM modules identified and documented
  - `scripts/check-batch-resolutions.mjs` — exists for automated outcome monitoring

✓ Accurate case usage: DeepSeek R1, MLX, Qwen 2.5 (as in source)

---

## Files Not Updated (Reason)

| File | Why Not Updated |
|------|-----------------|
| api-reference.md | No API contract changes related to model selection |
| code-standards.md | No standards changes needed |
| deployment-guide.md | Script is operational utility, not deployment-critical |
| project-overview-pdr.md | No requirements changes needed |
| index.md, sdk-quickstart.md | No user-facing API changes |

---

## Impact Summary

- **Internal knowledge**: Developers now aware that OpenClaw uses DeepSeek R1 by default with 120s timeout
- **Response handling**: Clear documentation that all LLM modules use centralized `llm-response-parser.ts`
- **Configuration**: Explicit timeout hierarchy documented (90s primary → 120s gateway boundary)
- **Monitoring**: Batch resolution checker documented in architecture

---

## Unresolved Questions

None. All changes verified against actual codebase implementation.
