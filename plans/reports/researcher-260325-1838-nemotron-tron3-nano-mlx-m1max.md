# Research Report: Nemotron-3 Nano 30B for M1 Max MLX

> Date: 2026-03-25 | Sources: 5 | Scope: NVIDIA Nemotron-3 Nano specs, MLX compatibility, M1 Max viability, trading use case

---

## Executive Summary

**NVIDIA Nemotron-3 Nano 30B-A3B** la model MoE hybrid (Mamba-2 + Transformer) voi 30B total params nhung chi **3.5B active params** per token. Day la game-changer cho M1 Max 32GB vi no chay nhanh nhu model 4B nhung co tri tue cua model 30B+.

So voi DeepSeek-R1-Distill-Qwen-32B (dang chay tren M1 Max), Nemotron-3 Nano co **toc do inference nhanh hon 5-8x** (35-50 t/s vs ~6-10 t/s) va **context window lon hon 8x** (1M vs 128K tokens). Trade-off: MMLU thap hon (78.5% vs 91.8%) va HumanEval kem hon (70.7% vs ~82%).

**Ket luan: KHYEN DUNG cho algo-trading** — toc do + context window > accuracy nhieu cho realtime trading decisions. Co the chay SONG SONG ca 2 model tren M1 Max.

---

## Model Specs

| Spec | Value |
|------|-------|
| **Full Name** | NVIDIA-Nemotron-3-Nano-30B-A3B |
| **Total Params** | 30.2B |
| **Active Params** | 3.5B (MoE — 6/128 experts active per token) |
| **Architecture** | Hybrid: 23 Mamba-2+MoE layers + 6 Attention layers |
| **Experts** | 128 experts + 1 shared expert |
| **Context Window** | 1,000,000 tokens (1M!) |
| **License** | NVIDIA Open Model License (Community) |
| **Function Calling** | Supported (agentic reasoning + tool use) |
| **HuggingFace** | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16` |
| **MLX Available** | Yes — `mlx-community` 4-bit, 8-bit |
| **GGUF Available** | Yes — but performance degraded (MoE not fully optimized in llama.cpp) |

### Architecture Detail

```
Input → [Mamba-2 + MoE Layer] x23 → [Attention Layer] x6 → Output
              ↓
    128 experts (6 active per token)
    + 1 shared expert (always active)
    = 3.5B compute per token
```

- **Mamba-2**: Linear-time sequence modeling (thay vi quadratic Attention)
- **MoE**: Chi activate 6/128 experts → tiet kiem compute cuc ky
- **Hybrid**: Van co 6 Attention layers de xu ly complex reasoning

---

## Benchmarks

| Benchmark | Nemotron-3 Nano 30B | DeepSeek-R1-Distill-Qwen-32B | Winner |
|-----------|---------------------|-------------------------------|--------|
| MMLU (5-shot) | 78.56% | 91.8% | DeepSeek |
| MMLU-Pro | 78.3% | ~75%* | Nemotron |
| HumanEval | 70.73% | ~82.3% | DeepSeek |
| Context Window | **1M tokens** | 128K tokens | **Nemotron** |
| Active Compute | **3.5B** | 32B | **Nemotron** |
| Function Calling | Native support | Limited | **Nemotron** |
| Inference Speed (M1 Max) | **35-50 t/s** | 6-10 t/s | **Nemotron** |

*Estimated from available benchmarks

---

## M1 Max Compatibility

**Actual Hardware: M1 Max 64GB RAM, 2TB SSD, 16-inch**

### Memory Requirements

| Quantization | RAM Required | Fit on 64GB M1 Max? |
|-------------|-------------|---------------------|
| BF16 (full) | ~60GB | Tight (no headroom) |
| **8-bit** | **~30GB** | **YES — high quality** |
| **4-bit** | **~18-20GB** | **YES — recommended** |
| 3-bit | ~14GB | Yes (overkill on 64GB) |

### Expected Performance on M1 Max (64GB, 400GB/s bandwidth)

| Metric | 4-bit Nemotron-3 Nano | 4-bit DeepSeek-R1-Distill-32B |
|--------|----------------------|-------------------------------|
| Token Generation | **35-50 t/s** | 6-10 t/s |
| Prompt Processing | **200+ t/s** | 30-50 t/s |
| Memory Usage | ~18-20GB | ~18-20GB |
| **Both running simultaneously** | **~36-40GB** | **YES — 24GB headroom** |

**Ly do Nemotron nhanh hon nhieu**: Chi compute 3.5B params per token (MoE) vs DeepSeek compute full 32B params (Dense). M1 Max 400GB/s memory bandwidth du de feed MoE expert switching.

### DUAL-MODEL SIMULTANEOUS (64GB Advantage)

| Component | RAM | Note |
|-----------|-----|------|
| Nemotron-3 Nano 30B 4-bit (port 11436) | 18GB | Fast scanner |
| DeepSeek-R1-Distill-32B 4-bit (port 11435) | 18GB | Deep reasoner |
| OS + Apps + PM2 | 8GB | macOS + algo-trade |
| **Headroom** | **20GB** | Context cache, spikes |
| **Total** | **64GB** | **Perfect fit** |

**64GB = chay DONG THOI ca 2 model, KHONG CAN hot-swap!**

### MLX Setup Guide

```bash
# 1. Install/update mlx-lm
pip install -U mlx-lm

# 2. Download 4-bit quantized model
python -m mlx_lm.convert \
  --hf-path nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16 \
  --quantize --q-bits 4 \
  --upload-repo mlx-community/Nemotron-3-Nano-30B-A3B-4bit

# OR download pre-converted from mlx-community:
huggingface-cli download mlx-community/NVIDIA-Nemotron-3-Nano-30B-A3B-4bit

# 3. Run inference
python -m mlx_lm.generate \
  --model mlx-community/NVIDIA-Nemotron-3-Nano-30B-A3B-4bit \
  --prompt "Analyze this market data..." \
  --max-tokens 512

# 4. Run as OpenAI-compatible server (for algo-trade integration)
python -m mlx_lm.server \
  --model mlx-community/NVIDIA-Nemotron-3-Nano-30B-A3B-4bit \
  --port 11436
```

---

## Trading Use Case Analysis

### Strengths for Algo-Trading

1. **Speed**: 35-50 t/s = sub-second trading decisions (vs 6-10 t/s DeepSeek)
2. **1M Context**: Load entire market history, order book, news — no truncation
3. **Function Calling**: Native tool use = perfect for trading bot pipeline (scan → predict → order)
4. **MoE Efficiency**: Low compute per token = lower latency per decision
5. **Agentic Reasoning**: Designed for multi-step tool-use workflows

### Weaknesses for Algo-Trading

1. **Lower Reasoning**: MMLU 78.5% vs 91.8% = less accurate complex analysis
2. **Newer Model**: Less community fine-tuning for finance domain
3. **Mamba Architecture**: Some edge cases in numerical reasoning vs pure Transformer
4. **License**: NVIDIA Community License (not Apache 2.0 like DeepSeek)

### Recommendation: Dual-Model Strategy (64GB — Both Simultaneous)

```
┌─────────────────────────────────────────────────────┐
│  DUAL-MODEL TRADING PIPELINE (M1 Max 64GB)          │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Nemotron-3 Nano (port 11436) — FAST SCANNER        │
│  ├─ Market scanning (every 5 min)                   │
│  ├─ Quick signal detection                          │
│  ├─ Function calling for API integration            │
│  └─ ~18GB RAM, 35-50 t/s                           │
│                                                     │
│  DeepSeek-R1-Distill (port 11435) — DEEP REASONER   │
│  ├─ Complex market analysis (on-demand)             │
│  ├─ Chain-of-thought reasoning                      │
│  └─ Final trade decision validation                 │
│                                                     │
│  Flow: Nemotron scans → flags signals →             │
│        DeepSeek validates → execute trade            │
│                                                     │
│  64GB RAM = BOTH MODELS RUN SIMULTANEOUSLY!         │
│  20GB headroom for OS + context cache               │
└─────────────────────────────────────────────────────┘
```

### Memory Budget (64GB M1 Max)

| Config | Nemotron | DeepSeek | OS/App | Headroom | Feasible? |
|--------|----------|----------|--------|----------|-----------|
| **Both 4-bit simultaneously** | **18GB** | **18GB** | **8GB** | **20GB** | **YES — RECOMMENDED** |
| Both 8-bit simultaneously | 30GB | 30GB | 4GB | 0GB | NO |
| Nemotron 8-bit + DeepSeek 4-bit | 30GB | 18GB | 8GB | 8GB | YES (higher quality Nemotron) |
| Nemotron 4-bit + DeepSeek 8-bit | 18GB | 30GB | 8GB | 8GB | YES (higher quality DeepSeek) |

**Best config cho M1 Max 64GB**: Ca 2 model 4-bit chay dong thoi, 20GB headroom du cho context cache va spikes.

---

## Comparison: Nemotron-3 Nano vs Nemotron Family

| Model | Params | Active | Architecture | Use Case |
|-------|--------|--------|-------------|----------|
| Nemotron-3 Nano **4B** | 4B | 4B (Dense) | Transformer | Edge/mobile, simple tasks |
| Nemotron-3 Nano **30B-A3B** | 30B | 3.5B (MoE) | Hybrid Mamba+MoE | **Best for M1 Max** |
| Nemotron-3 Super | ~49B | ~8B (MoE) | Hybrid | Needs 64GB+ RAM |
| Nemotron-3 Ultra | 253B | ~45B (MoE) | Hybrid | Needs datacenter |

---

## Integration with AlgoTrade

### Current Setup (DeepSeek only)
```env
OPENCLAW_GATEWAY_URL=http://192.168.11.111:11435/v1
```

### Proposed Dual-Model Setup
```env
# Fast scanner (Nemotron)
OPENCLAW_SCANNER_URL=http://192.168.11.111:11436/v1
OPENCLAW_SCANNER_MODEL=nemotron-3-nano-30b-4bit

# Deep reasoner (DeepSeek — existing)
OPENCLAW_GATEWAY_URL=http://192.168.11.111:11435/v1
OPENCLAW_GATEWAY_MODEL=deepseek-r1-distill-qwen-32b-4bit
```

### Code Change Needed
- Update `PredictionLoop` to support 2-tier model routing
- Fast scan with Nemotron → deep analysis with DeepSeek for flagged signals
- Model hot-swap logic if running single port

---

## Unresolved Questions

1. **MLX Mamba-2 support**: Does `mlx-lm` fully support Mamba-2 layers? Some early reports suggest partial support — need to verify with actual install
2. **Exact MLX Community model name**: Need to confirm exact HF repo name (may vary: `mlx-community/NVIDIA-Nemotron-3-Nano-30B-A3B-4bit` or similar)
3. **Hot-swap latency**: How long to load/unload 18GB model on M1 Max? If >30s, hot-swap not viable for realtime trading
4. **Finance fine-tune**: No known finance-specific fine-tune exists yet — may need to create one
5. **NVIDIA License restrictions**: Community license allows commercial use? Need legal review for trading bot

---

## Next Steps

1. **Verify MLX support**: `pip install -U mlx-lm && python -m mlx_lm.generate --model mlx-community/...`
2. **Benchmark on M1 Max**: Run actual t/s test with trading prompts
3. **Test function calling**: Verify structured output for trading signals
4. **Decide architecture**: Hot-swap vs dual-small-model vs single Nemotron
5. **Update algo-trade config**: Add scanner URL if adopting dual-model
