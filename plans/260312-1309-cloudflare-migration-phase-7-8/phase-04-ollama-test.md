# Phase 04: Test AGI SOPs with Ollama

**Parent:** [plan.md](./plan.md) | **Dependencies:** Phase 03 | **Parallel:** No (sequential)

---

## Overview

Install Ollama, pull LLM model, and test AGI SOPs engine with real trading SOPs.

**Priority:** High | **Effort:** 1-2 hours

---

## Key Insights

- Ollama provides local LLM inference (no API costs)
- llama3.2 is lightweight (3B params) and fast for SOP execution
- AGI SOPs engine calls Ollama via HTTP API

---

## Requirements

1. Install Ollama on local machine
2. Pull llama3.2 model
3. Configure environment variables
4. Run SOP engine with test SOP
5. Verify LLM responses
6. Document setup process

---

## Architecture

```
AGI SOPs (Node.js) → HTTP POST → Ollama (localhost:11434) → LLM Inference → Response
```

---

## Related Code Files

**Read:**
- `src/agi-sops/orchestrator.js` - Ollama HTTP client
- `src/agi-sops/index.js` - Environment config

**Modified:**
- `.env` (add OLLAMA_HOST, AGI_MODEL)

**Created:**
- `tests/sop-test.js` - Test script
- `docs/ollama-setup.md` - Setup guide

---

## File Ownership

| File | Change |
|------|--------|
| `.env` | Add Ollama config |
| `tests/sop-test.js` | Create test script |
| `docs/ollama-setup.md` | Create documentation |

---

## Implementation Steps

### Step 1: Install Ollama

**macOS:**
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

**Verify:**
```bash
ollama --version
```

### Step 2: Pull Model

```bash
ollama pull llama3.2
# Downloads ~2GB model

# Verify
ollama list
# Should show: llama3.2    3b    2.0GB
```

### Step 3: Start Ollama Server

```bash
ollama serve
# Runs on http://127.0.0.1:11434
```

### Step 4: Configure Environment

**Create .env:**
```bash
AGI_MODEL=llama3.2
OLLAMA_HOST=http://127.0.0.1:11434
```

### Step 5: Test LLM Connection

```bash
curl http://127.0.0.1:11434/api/generate -d '{
  "model": "llama3.2",
  "prompt": "Hello, are you ready?"
}'
```

### Step 6: Run SOP Test

**Create tests/sop-test.js:**
```javascript
const Orchestrator = require('../src/agi-sops/orchestrator');

async function testSOP() {
  const orchestrator = new Orchestrator({
    model: 'llama3.2',
    host: 'http://127.0.0.1:11434'
  });

  // Load test SOP
  const result = await orchestrator.loadSOP('sops/daily-scan.json');
  console.log('SOP loaded:', result.name);

  // Execute first step only (quick test)
  const stepResult = await orchestrator.executeStep(result.steps[0]);
  console.log('Step 1 result:', stepResult);

  return stepResult;
}

testSOP().catch(console.error);
```

**Run test:**
```bash
cd /Users/macbookprom1/mekong-cli/apps/algo-trader
node tests/sop-test.js
```

### Step 7: Full SOP Execution Test

```bash
npm run sop:run sops/daily-scan.json
```

### Step 8: Document Setup

**docs/ollama-setup.md:**
```markdown
# Ollama Setup for AGI SOPs

## Installation
1. Install: `curl -fsSL https://ollama.com/install.sh | sh`
2. Pull model: `ollama pull llama3.2`
3. Start server: `ollama serve`

## Configuration
Add to .env:
```
AGI_MODEL=llama3.2
OLLAMA_HOST=http://127.0.0.1:11434
```

## Testing
```bash
npm run sop:run sops/daily-scan.json
```
```

---

## Todo List

- [ ] Install Ollama
- [ ] Pull llama3.2 model
- [ ] Start Ollama server
- [ ] Configure .env variables
- [ ] Test LLM connection
- [ ] Create tests/sop-test.js
- [ ] Run SOP test
- [ ] Create docs/ollama-setup.md

---

## Success Criteria

- Ollama installed and running
- llama3.2 model available
- SOP engine connects successfully
- Test SOP executes without errors
- LLM responses received and parsed

---

## Conflict Prevention

No conflicts - test files and docs are exclusive to this phase.

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Ollama install fails | Medium | Use Docker: `docker run ollama/ollama` |
| Model too large | Low | Use smaller model (llama3.2:800m) |
| Slow inference | Medium | Run on M1 Mac (has Neural Engine) |

---

## Security Considerations

- Ollama runs locally only (no external exposure)
- Don't expose port 11434 to internet
- Use firewall to block external access

---

## Next Steps

After completion:
- AGI SOPs fully operational
- Ready for production trading
- Phase 05: Add more sophisticated trading strategies
