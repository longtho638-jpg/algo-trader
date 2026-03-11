# Research: AGI LLM Local Deployment for Trading

**Date:** 2026-03-11
**Topic:** Local LLM options, requirements, integration patterns

---

## 1. Local LLM Options

| Option | Best For | VRAM | Notes |
|--------|----------|------|-------|
| **Ollama** | Dev/Testing | 4-8GB | Easiest setup, REST API |
| **vLLM** | Production | 16-80GB | High throughput, PagedAttention |
| **LM Studio** | Desktop | 4-16GB | GUI, local inference |
| **LocalAI** | Self-hosted | 8-24GB | OpenAI-compatible API |
| **TGI** | Enterprise | 24-80GB | Hugging Face official |

**Recommendation:** Ollama for dev, vLLM for production

**Sources:**
- https://ollama.ai
- https://docs.vllm.ai
- https://github.com/huggingface/text-generation-inference

---

## 2. Model Requirements for Trading

| Task | Model Size | Context | Reason |
|------|------------|---------|--------|
| Signal analysis | 7B-13B | 4K | Fast inference |
| Regime detection | 13B-34B | 8K | Pattern recognition |
| Risk assessment | 7B-13B | 2K | Binary classification |
| Trade explanation | 13B-70B | 16K | CoT reasoning |

**Recommended Models:**
- Llama 3.1 8B (fast, good for signals)
- Mistral 7B (efficient)
- Qwen2.5 14B (multilingual, good reasoning)

**Source:** https://huggingface.co/models?sort=trending

---

## 3. Hardware Requirements

### Minimum (7B models, Q4_K_M)
- RAM: 16GB
- VRAM: 6GB (RTX 3060)
- Storage: 20GB SSD

### Recommended (13B-34B models)
- RAM: 32GB
- VRAM: 12-16GB (RTX 4080/4090)
- Storage: 50GB NVMe

### Optimal (70B models)
- RAM: 64GB
- VRAM: 24GB (RTX 4090) or 48GB (A6000)
- Dual GPU for throughput

### Quantization Impact
| Quant | 7B Size | 13B Size | Quality Loss |
|-------|---------|----------|--------------|
| Q4_K_M | 4GB | 8GB | Minimal |
| Q5_K_M | 5GB | 10GB | None |
| Q8_0 | 8GB | 16GB | None |

**Source:** https://github.com/ggerganov/llama.cpp

---

## 4. Integration Patterns

### Pattern 1: REST API (Recommended)
```python
import requests

response = requests.post('http://localhost:11434/api/generate', json={
    'model': 'llama3.1:8b',
    'prompt': 'Analyze market regime: RSI=72, MACD=positive...',
    'stream': False
})
decision = response.json()['response']
```

### Pattern 2: Python Library
```python
from ollama import chat

response = chat(model='llama3.1:8b', messages=[
    {'role': 'user', 'content': 'Should I buy BTC?'}
])
print(response['message']['content'])
```

### Pattern 3: Streaming
```python
import ollama

stream = ollama.chat(model='llama3.1:8b', messages=[...], stream=True)
for chunk in stream:
    process(chunk['message']['content'])
```

---

## 5. Latency Considerations

| Component | Latency | Optimization |
|-----------|---------|--------------|
| Model inference | 50-500ms | Quantization, GPU |
| API call | 5-20ms | Localhost |
| Prompt encoding | 10-50ms | Cache system prompt |
| Total | 65-570ms |_pipeline_ |

### For Live Trading
- Use 7B-13B models (faster)
- Q4_K_M quantization (best speed/quality)
- Pre-warm model (keep loaded)
- Batch requests when possible
- Use GPU (CUDA, Metal)

### For Offline Analysis
- Use 34B-70B models (better reasoning)
- Q8_0 or FP16 (no quality loss)
- Batch backtest scenarios

---

## 6. OpenClaw Integration

### Existing Files
- `src/core/llm_client.py` — LLM router
- `src/agents/` — Agent definitions
- `mekong/adapters/llm-providers.yaml` — Provider configs

### Required Changes
1. Add Ollama provider to `llm_client.py`
2. Create `local-llm-config.yaml`
3. Update `llm-providers.yaml` with local endpoint
4. Add fallback chain: Local → OpenRouter → Ollama

### Config Example
```yaml
providers:
  ollama:
    base_url: http://localhost:11434
    models:
      - llama3.1:8b
      - mistral:7b
      - qwen2.5:14b
    timeout: 30s
    retry: 3
```

---

## Key Insights

1. **Ollama = Easiest** — One command setup, REST API
2. **7B-13B for live** — Fast enough for trading (<200ms)
3. **Q4_K_M sweet spot** — Minimal quality loss, 50% size
4. **GPU essential** — 10x faster than CPU
5. **Pre-warm model** — Avoid cold start latency

---

## Unresolved Questions

1. Should we support multiple local LLM backends?
2. What's the fallback strategy when local LLM is down?
3. Do we need model auto-switching based on task type?

---

**Sources:**
- https://ollama.ai
- https://docs.vllm.ai
- https://github.com/ggerganov/llama.cpp
- https://huggingface.co/models
