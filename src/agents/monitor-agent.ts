// Monitor Agent — returns strategy orchestrator status or process summary
import type { SpecialistAgent, AgentTask, AgentResult } from './agent-base.js';
import { successResult, failResult } from './agent-base.js';
import { logger } from '../core/logger.js';

export class MonitorAgent implements SpecialistAgent {
  readonly name = 'monitor';
  readonly description = 'Returns strategy orchestrator status and running process summary';
  readonly taskTypes = ['monitor' as const];

  canHandle(task: AgentTask): boolean {
    return task.type === 'monitor';
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    const start = Date.now();
    try {
      const { json: _json } = task.payload as { json?: boolean };

      // Lazy import to avoid coupling to live bot runtime
      let orchestratorStatus: unknown = null;
      try {
        const { StrategyOrchestrator } = await import('../strategies/strategy-orchestrator.js');
        const orc = new StrategyOrchestrator();
        orchestratorStatus = orc.getStatus();
      } catch {
        orchestratorStatus = null;
      }

      const botRunning = process.env.BOT_RUNNING === 'true';
      const botMode = process.env.BOT_MODE ?? 'paper';
      const uptime = process.uptime();

      logger.info('Monitor agent executing', 'MonitorAgent', { botRunning, botMode });

      return successResult(this.name, task.id, {
        process: {
          uptime: Math.round(uptime),
          botRunning,
          botMode,
          nodeVersion: process.version,
          pid: process.pid,
        },
        strategies: orchestratorStatus ?? [],
        note: orchestratorStatus === null
          ? 'Strategy orchestrator not initialized. Start bot to see live strategy status.'
          : undefined,
      }, Date.now() - start);
    } catch (err) {
      return failResult(this.name, task.id, err instanceof Error ? err.message : String(err), Date.now() - start);
    }
  }
}
