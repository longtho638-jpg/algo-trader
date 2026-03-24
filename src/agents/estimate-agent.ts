// Estimate Agent — runs ensemble probability estimate for a market question
import type { SpecialistAgent, AgentTask, AgentResult } from './agent-base.js';
import { successResult, failResult } from './agent-base.js';
import { logger } from '../core/logger.js';

export class EstimateAgent implements SpecialistAgent {
  readonly name = 'estimate';
  readonly description = 'Runs ensemble LLM probability estimate for a prediction market question';
  readonly taskTypes = ['estimate' as const];

  canHandle(task: AgentTask): boolean {
    return task.type === 'estimate';
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    const start = Date.now();
    try {
      const { question } = task.payload as { question: string };
      if (!question?.trim()) {
        return failResult(this.name, task.id, 'question is required', Date.now() - start);
      }

      // Lazy imports — require live OpenClaw gateway
      const [{ PredictionProbabilityEstimator }, { EnsembleEstimator }] = await Promise.all([
        import('../openclaw/prediction-probability-estimator.js'),
        import('../openclaw/ensemble-estimator.js'),
      ]);

      const base = new PredictionProbabilityEstimator();
      const ensemble = new EnsembleEstimator(base, { n: 3, temperatures: [0.2, 0.4, 0.6], maxDisagreement: 0.15 });

      const signal = await ensemble.estimate({
        marketId: `adhoc-${Date.now()}`,
        question,
        yesPrice: 0.5, // neutral prior when no market price provided
      });

      logger.info('Estimate agent complete', 'EstimateAgent', {
        edge: signal.edge.toFixed(3),
        direction: signal.direction,
        confidence: signal.confidence.toFixed(2),
      });

      return successResult(this.name, task.id, signal, Date.now() - start);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('Estimate agent failed — DeepSeek/OpenClaw may be unavailable', 'EstimateAgent', { err: msg });
      return failResult(this.name, task.id, `Estimate failed: ${msg}`, Date.now() - start);
    }
  }
}
