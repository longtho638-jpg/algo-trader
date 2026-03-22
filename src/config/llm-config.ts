/**
 * LLM Configuration for M1 Max 64GB
 * MLX primary (17.4 tok/s) -> Ollama fallback (12 tok/s) -> Claude cloud
 */

export interface LlmEndpoint {
  url: string;
  model: string;
  priority: number;
  maxTokens: number;
  timeoutMs: number;
}

export interface LlmConfig {
  primary: LlmEndpoint;
  fallback: LlmEndpoint;
  cloud?: LlmEndpoint;
  healthCheckIntervalMs: number;
  cloudDailyBudgetUsd: number;
}

export function loadLlmConfig(): LlmConfig {
  return {
    primary: {
      url: process.env.LLM_PRIMARY_URL || 'http://127.0.0.1:11435/v1',
      model: process.env.LLM_PRIMARY_MODEL || 'mlx-community/Qwen2.5-Coder-32B-Instruct-4bit',
      priority: 1,
      maxTokens: 2048,
      timeoutMs: 30000,
    },
    fallback: {
      url: process.env.LLM_FALLBACK_URL || 'http://127.0.0.1:11434/v1',
      model: process.env.LLM_FALLBACK_MODEL || 'qwen2.5-coder:32b',
      priority: 2,
      maxTokens: 2048,
      timeoutMs: 30000,
    },
    cloud: process.env.CLAUDE_API_KEY ? {
      url: process.env.LLM_CLOUD_URL || 'https://api.anthropic.com/v1',
      model: process.env.LLM_CLOUD_MODEL || 'claude-sonnet-4-20250514',
      priority: 3,
      maxTokens: 4096,
      timeoutMs: 60000,
    } : undefined,
    healthCheckIntervalMs: 30000,
    cloudDailyBudgetUsd: Number(process.env.LLM_CLOUD_DAILY_BUDGET) || 100,
  };
}
