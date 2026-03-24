import { describe, it, expect } from 'vitest';
import { autoSelectModels, type OllamaModel } from '../../src/openclaw/ollama-health-check.js';

describe('autoSelectModels', () => {
  it('should select models from available list', () => {
    const models: OllamaModel[] = [
      { name: 'llama3.1:8b', size: 4_000_000, parameterSize: '8B' },
      { name: 'deepseek-r1:32b', size: 16_000_000, parameterSize: '32B' },
      { name: 'deepseek-r1:14b', size: 7_000_000, parameterSize: '14B' },
    ];
    const result = autoSelectModels(models);
    expect(result.simple).toBeDefined();
    expect(result.standard).toBeDefined();
    expect(result.complex).toBeDefined();
  });

  it('should prefer larger models for complex tier', () => {
    const models: OllamaModel[] = [
      { name: 'llama3.1:8b', size: 4_000_000, parameterSize: '8B' },
      { name: 'deepseek-r1:32b', size: 16_000_000, parameterSize: '32B' },
    ];
    const result = autoSelectModels(models);
    expect(result.complex).toContain('deepseek');
  });

  it('should prefer smaller models for simple tier', () => {
    const models: OllamaModel[] = [
      { name: 'deepseek-r1:14b', size: 7_000_000, parameterSize: '14B' },
      { name: 'deepseek-r1:32b', size: 16_000_000, parameterSize: '32B' },
    ];
    const result = autoSelectModels(models);
    expect(result.simple).toContain('deepseek');
  });

  it('should fallback to first model when no preferences match', () => {
    const models: OllamaModel[] = [
      { name: 'custom-model:1b', size: 500_000, parameterSize: '1B' },
    ];
    const result = autoSelectModels(models);
    expect(result.simple).toBe('custom-model:1b');
    expect(result.standard).toBe('custom-model:1b');
    expect(result.complex).toBe('custom-model:1b');
  });

  it('should fallback to default when no models', () => {
    const result = autoSelectModels([]);
    expect(result.simple).toBe('llama3.1:8b');
  });
});
