# Code Review: Qwen -> DeepSeek R1 Migration

## Scope
- Files: `openclaw-config.ts`, `llm-config.ts`, `openclaw-config.test.ts`, `paper-trade-event-only.mjs`
- LOC: ~270 across 4 files
- Focus: Model switch correctness, think-block parsing, timeout, leftover references
- Scout: 6 additional consumers of LLM responses checked for think-block compatibility

## Overall Assessment
Migration is **well-executed** for the script layer. The critical gap is in the **production TypeScript modules** that parse LLM responses -- they do NOT strip `<think>` blocks, which DeepSeek R1 will produce.

---

## CRITICAL Issues

### 1. Production parsers lack `<think>` block stripping

**Impact: HIGH -- will cause parse failures in live trading**

DeepSeek R1 wraps chain-of-thought in `<think>...</think>` tags before the JSON payload. The script (`paper-trade-event-only.mjs`) correctly strips these, but the production modules do NOT:

| File | Line | Has think-block stripping? |
|------|------|---------------------------|
| `src/openclaw/prediction-probability-estimator.ts` | 125 | NO -- only strips markdown fences |
| `src/openclaw/ai-signal-generator.ts` | 137 | NO -- only strips markdown fences |
| `src/openclaw/ai-router.ts` | 109 | NO -- returns raw content |
| `src/openclaw/algorithm-tuner.ts` | ~170 | NO -- only strips markdown fences |
| `src/openclaw/ai-risk-adjuster.ts` | ~90 | NO -- only strips markdown fences |
| `src/openclaw/ai-strategy-selector.ts` | ~88 | NO -- only strips markdown fences |
| `src/strategies/polymarket/llm-sentiment-strategy.ts` | 144 | NO -- does raw JSON.parse |
| `src/lib/llm-router.ts` | 117 | NO -- returns raw content |

**Fix required** -- every `parseResponse`/`parseSignal` method needs:
```typescript
// Add before markdown stripping
const cleaned = raw
  .replace(/<think>[\s\S]*?<\/think>/g, '')  // Strip DeepSeek R1 think blocks
  .replace(/```(?:json)?\n?/g, '')
  .trim();
```

**Recommendation**: Extract a shared `stripLlmWrapper(raw: string): string` utility in `src/lib/` to DRY this across all parsers.

### 2. `llm-sentiment-strategy.ts` does raw `JSON.parse` (line 144)

This will fail 100% of the time with DeepSeek R1 because the response will be `<think>...</think>{"probability":...}` which is not valid JSON.

```typescript
// Current (line 144) -- WILL BREAK
const parsed = JSON.parse(response.content) as LlmEstimate;

// Fix needed
const cleaned = response.content
  .replace(/<think>[\s\S]*?<\/think>/g, '')
  .replace(/```(?:json)?\n?/g, '').trim();
const match = cleaned.match(/\{[\s\S]*\}/);
if (!match) throw new Error('No JSON');
const parsed = JSON.parse(match[0]) as LlmEstimate;
```

---

## HIGH Priority

### 3. `maxTokens: 300` in prediction-probability-estimator.ts (line 71)

DeepSeek R1 uses tokens for `<think>` reasoning BEFORE producing JSON. With `maxTokens: 300`, the think block alone may consume all tokens, truncating the JSON response.

The script uses `max_tokens: 2000` for good reason. Production estimator should use at least **1500-2000** for DeepSeek R1.

Similarly, `ai-signal-generator.ts` uses `maxTokens: 256` (line 61) -- too low for R1.

**Recommendation**: For all modules routing to `standard` or `complex` tier (DeepSeek R1), increase `maxTokens` to at least 1500.

### 4. `ai-router.ts` timeout: 60s config vs 120s script

Config default is `60_000ms`. Script uses `120_000ms`. Given DeepSeek R1 averaging ~33s/call, 60s is tight -- a busy system or longer think chain could timeout.

**Recommendation**: Increase `DEFAULT_CONFIG.timeout` to `90_000` or `120_000` to match the script's experience.

### 5. `llm-router.ts` timeout: 30s (line 29) -- too aggressive for R1

`LlmConfig.primary.timeoutMs = 30000`. This is the generic LLM router used by `llm-sentiment-strategy.ts`. At 33s average R1 latency, ~50% of calls will timeout.

**Fix**: Increase to at least `90000` for the primary MLX endpoint.

---

## MEDIUM Priority

### 6. Greedy JSON regex in production vs non-greedy in script

Script (line 96):
```javascript
const match = cleaned.match(/\{[\s\S]*?\}/g)?.find(m => m.includes('probability'));
```
Uses non-greedy `*?` and filters by key -- robust against multiple JSON objects.

Production (`prediction-probability-estimator.ts` line 126):
```typescript
const match = cleaned.match(/\{[\s\S]*\}/);
```
Uses greedy `*` -- if DeepSeek R1 outputs multiple `{}` blocks (e.g., examples in reasoning), this captures everything from first `{` to last `}`, potentially producing invalid JSON.

**Recommendation**: Adopt the script's non-greedy + key-filter pattern across all production parsers.

### 7. `msg.reasoning` field handling in script (line 91)

```javascript
const raw = (msg.content || '') + (msg.reasoning || '');
```
This concatenates `content` and `reasoning` fields. The OpenAI-compatible API may return reasoning in a separate field for R1 models. The production `ai-router.ts` only reads `content` (line 109). If the MLX server puts the JSON in `reasoning` instead of `content`, production will get empty responses.

**Recommendation**: Verify what the MLX server returns for DeepSeek R1. If it uses the `reasoning` field, update `ai-router.ts` to concatenate both.

### 8. Leftover Qwen references in prediction paths

| Location | Risk |
|----------|------|
| `openclaw-config.ts:25` simple tier = Qwen | OK -- simple tasks (price lookups) still on Qwen, intentional |
| `llm-config.ts:33` fallback = `qwen2.5-coder:32b` | OK -- Ollama fallback, intentional |
| `ollama-health-check.ts:63-65` Qwen in preference lists | OK -- Ollama layer, not MLX |
| `ab-test-models.mjs` Qwen references | OK -- A/B test script, historical |

No leftover Qwen in prediction-critical paths. The `simple` tier intentionally keeps Qwen for quick tasks.

---

## LOW Priority

### 9. `paper-trade-event-only.mjs` -- no retry on LLM timeout

Single attempt per market. If DeepSeek R1 is slow on one call, that market is silently skipped. Consider 1 retry with backoff for production use.

### 10. Model ID correctness

`mlx-community/DeepSeek-R1-Distill-Qwen-32B-4bit` -- confirmed correct across all 4 files. Consistent.

---

## Positive Observations

- Think-block parsing in script is well-implemented (strip + non-greedy + key filter)
- Blind strategy prompt is model-agnostic -- works with any reasoning model
- Fallback to `{probability: 0.5, confidence: 0.3}` on parse error is safe default
- Test assertions correctly updated to match new model IDs
- `temperature: 0.3` is appropriate for calibrated estimates

---

## Recommended Actions (Priority Order)

1. **[CRITICAL]** Add `<think>` block stripping to ALL production parsers (6 files)
2. **[CRITICAL]** Fix `llm-sentiment-strategy.ts` raw JSON.parse
3. **[HIGH]** Increase `maxTokens` to 1500+ for standard/complex tier calls
4. **[HIGH]** Increase timeouts: `openclaw-config` to 90-120s, `llm-config` primary to 90s
5. **[MEDIUM]** Switch all greedy `\{[\s\S]*\}` to non-greedy + key filter pattern
6. **[MEDIUM]** Extract shared `stripLlmWrapper()` utility to DRY the parsing
7. **[MEDIUM]** Verify MLX server `reasoning` field behavior for R1

## Unresolved Questions

1. Does the MLX server (`localhost:11435`) return DeepSeek R1's chain-of-thought in `content` or in a separate `reasoning` field? This determines whether `ai-router.ts` needs updating.
2. Is the `simple` tier intentionally kept on Qwen, or should it also migrate to a lighter DeepSeek variant?
3. What is the observed p95 latency for DeepSeek R1 on M1 Max? If >60s, the timeout needs to be even higher than 120s.
