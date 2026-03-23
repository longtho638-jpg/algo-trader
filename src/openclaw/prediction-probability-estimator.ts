// Prediction Probability Estimator — asks OpenClaw for a calibrated P(YES) estimate
// Input: market question + current YES price (implied probability from orderbook)
// Output: { estimatedProbability, confidence, reasoning, edge, direction }

import { AiRouter } from './ai-router.js';
import { loadOpenClawConfig } from './openclaw-config.js';
import { logger } from '../core/logger.js';

export interface PredictionInput {
  marketId: string;
  question: string;
  /** Resolution criteria or additional context (optional) */
  resolutionCriteria?: string;
  /** Current YES token mid-price (= market implied probability, 0-1) */
  yesPrice: number;
}

export interface PredictionSignal {
  marketId: string;
  /** Our LLM-estimated probability that the market resolves YES (0-1) */
  ourProb: number;
  /** Market implied probability from current YES price (0-1) */
  marketProb: number;
  /** edge = ourProb - marketProb; positive → buy YES, negative → buy NO */
  edge: number;
  /** Recommended trade direction */
  direction: 'buy_yes' | 'buy_no' | 'skip';
  /** LLM confidence in the estimate (0-1) */
  confidence: number;
  /** LLM reasoning text */
  reasoning: string;
  /** Model used for estimation */
  model: string;
  /** Latency in milliseconds */
  latencyMs: number;
}

interface RawEstimateJson {
  probability?: number;
  confidence?: number;
  reasoning?: string;
}

// Minimum |edge| to generate a signal (skip near-zero edges)
const MIN_EDGE_THRESHOLD = 0.03;

export class PredictionProbabilityEstimator {
  private readonly router: AiRouter;

  constructor(router?: AiRouter) {
    this.router = router ?? new AiRouter(loadOpenClawConfig());
  }

  /**
   * Estimate probability and compute edge vs market implied probability.
   * Returns a PredictionSignal with direction = 'skip' when edge < threshold.
   */
  async estimate(input: PredictionInput): Promise<PredictionSignal> {
    const startMs = Date.now();

    const prompt = this.buildPrompt(input);
    const res = await this.router.chat({
      prompt,
      systemPrompt: [
        'You are a calibrated prediction market analyst.',
        'Estimate probabilities objectively based on available information.',
        'Respond ONLY with valid JSON — no markdown, no extra text.',
      ].join(' '),
      complexity: 'standard',
      maxTokens: 300,
    });

    const latencyMs = Date.now() - startMs;
    const parsed = this.parseResponse(res.content);
    const edge = parsed.probability - input.yesPrice;
    const direction = this.resolveDirection(edge);

    logger.debug('Prediction estimate', 'PredictionEstimator', {
      marketId: input.marketId,
      ourProb: parsed.probability,
      marketProb: input.yesPrice,
      edge,
      direction,
    });

    return {
      marketId: input.marketId,
      ourProb: parsed.probability,
      marketProb: input.yesPrice,
      edge,
      direction,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
      model: res.model,
      latencyMs,
    };
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  private buildPrompt(input: PredictionInput): string {
    const lines = [
      `Prediction market question: "${input.question}"`,
    ];
    if (input.resolutionCriteria) {
      lines.push(`Resolution criteria: ${input.resolutionCriteria}`);
    }
    lines.push(
      `Current market-implied probability (YES price): ${(input.yesPrice * 100).toFixed(1)}%`,
      '',
      'Estimate the true probability this market resolves YES.',
      'Consider base rates, recent news, logical consistency, and market efficiency.',
      '',
      'Respond with ONLY this JSON:',
      '{"probability":0.0-1.0,"confidence":0.0-1.0,"reasoning":"brief explanation max 120 chars"}',
    );
    return lines.join('\n');
  }

  private parseResponse(raw: string): { probability: number; confidence: number; reasoning: string } {
    try {
      const cleaned = raw.replace(/```(?:json)?\n?/g, '').trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('No JSON in response');

      const data = JSON.parse(match[0]) as RawEstimateJson;
      return {
        probability: typeof data.probability === 'number'
          ? Math.max(0.01, Math.min(0.99, data.probability)) : 0.5,
        confidence: typeof data.confidence === 'number'
          ? Math.max(0, Math.min(1, data.confidence)) : 0.5,
        reasoning: typeof data.reasoning === 'string'
          ? data.reasoning.slice(0, 200) : 'No reasoning provided',
      };
    } catch {
      return { probability: 0.5, confidence: 0.3, reasoning: `Parse error: ${raw.slice(0, 80)}` };
    }
  }

  private resolveDirection(edge: number): PredictionSignal['direction'] {
    if (edge > MIN_EDGE_THRESHOLD) return 'buy_yes';
    if (edge < -MIN_EDGE_THRESHOLD) return 'buy_no';
    return 'skip';
  }
}
