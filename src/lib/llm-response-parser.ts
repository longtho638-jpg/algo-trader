// Shared LLM response parser — handles DeepSeek R1 think blocks, markdown fences, and reasoning field
// All OpenClaw modules that parse JSON from LLM responses should use this utility

/**
 * Strip DeepSeek R1 `<think>` blocks and markdown fences from LLM output,
 * then extract the first JSON object containing a required key.
 */
export function extractLlmJson<T = Record<string, unknown>>(
  raw: string,
  requiredKey?: string,
): T {
  // Strip think blocks and markdown fences
  const cleaned = raw
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/```(?:json)?\n?/g, '')
    .trim();

  if (requiredKey) {
    // Find the first JSON object containing the required key
    const matches = cleaned.match(/\{[\s\S]*?\}/g);
    const hit = matches?.find(m => m.includes(requiredKey));
    if (!hit) throw new Error(`No JSON with key "${requiredKey}" in LLM response`);
    return JSON.parse(hit) as T;
  }

  // Fallback: extract first JSON object
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in LLM response');
  return JSON.parse(match[0]) as T;
}

/**
 * Combine content + reasoning fields from OpenAI-compatible chat response.
 * DeepSeek R1 via MLX may put chain-of-thought in a separate `reasoning` field.
 */
export function combineLlmContent(message: { content?: string; reasoning?: string }): string {
  return (message.content || '') + (message.reasoning || '');
}
