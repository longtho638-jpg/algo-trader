// AgentDispatcher — routes tasks to registered specialist agents (Mekong-style)
// Single brain dispatching to specialist agents by task type

import type { AgentTask, AgentResult, SpecialistAgent } from './agent-base.js';
import { logger } from '../core/logger.js';

export class AgentDispatcher {
  private agents: Map<string, SpecialistAgent> = new Map();

  register(agent: SpecialistAgent): void {
    if (this.agents.has(agent.name)) {
      logger.warn(`Agent "${agent.name}" already registered, overwriting`, 'Dispatcher');
    }
    this.agents.set(agent.name, agent);
    logger.debug(`Registered agent: ${agent.name} [${agent.taskTypes.join(', ')}]`, 'Dispatcher');
  }

  async dispatch(task: AgentTask): Promise<AgentResult> {
    for (const agent of this.agents.values()) {
      if (agent.canHandle(task)) {
        logger.info(`Dispatching ${task.type} → ${agent.name}`, 'Dispatcher');
        return agent.execute(task);
      }
    }
    throw new Error(`No agent registered for task type: ${task.type}`);
  }

  getAgent(name: string): SpecialistAgent | undefined {
    return this.agents.get(name);
  }

  listAgents(): { name: string; description: string; taskTypes: string[] }[] {
    return Array.from(this.agents.values()).map(a => ({
      name: a.name,
      description: a.description,
      taskTypes: [...a.taskTypes],
    }));
  }

  get agentCount(): number {
    return this.agents.size;
  }
}
