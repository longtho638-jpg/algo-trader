// Calibrate Agent — runs CalibrationTuner.analyzeFromDb() and returns calibration report
import type { SpecialistAgent, AgentTask, AgentResult } from './agent-base.js';
import { successResult, failResult } from './agent-base.js';
import { CalibrationTuner } from '../openclaw/calibration-tuner.js';
import { logger } from '../core/logger.js';

export class CalibrateAgent implements SpecialistAgent {
  readonly name = 'calibrate';
  readonly description = 'Analyzes resolved trades and produces calibration report with bias detection';
  readonly taskTypes = ['calibrate' as const];

  canHandle(task: AgentTask): boolean {
    return task.type === 'calibrate';
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    const start = Date.now();
    try {
      const { dbPath = process.env.DB_PATH ?? 'data/algo-trade.db' } = task.payload as { dbPath?: string };

      logger.info('Calibrate agent executing', 'CalibrateAgent', { dbPath });

      const tuner = new CalibrationTuner();
      const report = await tuner.analyzeFromDb(dbPath);

      if (!report) {
        return successResult(this.name, task.id, {
          status: 'insufficient_data',
          message: 'Need at least 10 resolved trades to run calibration analysis.',
          dbPath,
        }, Date.now() - start);
      }

      return successResult(this.name, task.id, report, Date.now() - start);
    } catch (err) {
      return failResult(this.name, task.id, err instanceof Error ? err.message : String(err), Date.now() - start);
    }
  }
}
