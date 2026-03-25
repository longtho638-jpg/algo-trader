/**
 * LLM Configuration for M1 Max 64GB — Dual-Model Pipeline
 * Nemotron-3 Nano (fast scanner, 35-50 t/s) → DeepSeek R1 (deep reasoner) → Claude cloud
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
      url: process.env.LLM_PRIMARY_URL || 'http://192.168.11.111:11436/v1',
      model: process.env.LLM_PRIMARY_MODEL || 'mlx-community/NVIDIA-Nemotron-3-Nano-30B-A3B-4bit',
      priority: 1,
      maxTokens: 2048,
      timeoutMs: 30000,
    },
    fallback: {
      url: process.env.LLM_FALLBACK_URL || 'http://192.168.11.111:11435/v1',
      model: process.env.LLM_FALLBACK_MODEL || 'mlx-community/DeepSeek-R1-Distill-Qwen-32B-4bit',
      priority: 2,
      maxTokens: 2048,
      timeoutMs: 90000,
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
