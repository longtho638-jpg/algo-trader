# Phase 1: LLM Client (Ollama Integration)

**Created:** 2026-03-11
**Priority:** P0
**Status:** Pending
**Owner:** Backend

---

## Context Links

- Parent Plan: [plan.md](./plan.md)
- Research: [reports/researcher-01-llm-local-deployment.md](../reports/researcher-01-llm-local-deployment.md)
- Tech Stack: [docs/agi-openclaw-tech-stack.md](../docs/agi-openclaw-tech-stack.md)

---

## Overview

Implement Ollama client for local LLM inference.

| Attribute | Value |
|-----------|-------|
| ETA | 2 hours |
| Priority | P0 |
| Status | Pending |

---

## Requirements

**Functional:**
- Connect to Ollama API (http://localhost:11434)
- Support generate and chat endpoints
- Handle streaming responses
- Retry logic with exponential backoff

**Non-Functional:**
- Timeout: 30 seconds
- Max retries: 3
- Log all requests/responses

---

## Implementation Steps

1. Create `src/agi/clients/ollama-client.ts`
2. Implement `generate()` method
3. Implement `chat()` method
4. Add streaming support
5. Add retry logic
6. Write unit tests
7. Test with actual Ollama instance

---

## Todo List

- [ ] Create ollama-client.ts
- [ ] Implement generate()
- [ ] Implement chat()
- [ ] Add streaming
- [ ] Add retry logic
- [ ] Write tests
- [ ] Test with Ollama

---

## Success Criteria

```typescript
// Must work:
const client = new OllamaClient({ baseURL: 'http://localhost:11434' });
const response = await client.generate({
  model: 'llama3.1:8b',
  prompt: 'Analyze this market signal: RSI=72...'
});
console.log(response.response); // Should print LLM response
```

---

## Related Files

- Create: `src/agi/clients/ollama-client.ts`
- Create: `src/agi/types/ollama.types.ts`
- Create: `src/agi/configs/ollama-config.yaml`

---

## Next Steps

→ Proceed to [Phase 2: SOP Engine](./phase-02-sop-engine.md)
