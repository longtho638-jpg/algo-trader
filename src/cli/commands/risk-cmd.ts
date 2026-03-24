// Risk command — dispatches risk task to RiskAgent via AgentDispatcher
// Usage: algo risk

import type { Command } from 'commander';
import type { AgentDispatcher } from '../../agents/agent-dispatcher.js';
import { registerCommand } from '../../agents/command-registry.js';

export function createRiskCommand(program: Command, dispatcher: AgentDispatcher): Command {
  return registerCommand(program, dispatcher, {
    name: 'risk',
    description: 'Evaluate current portfolio risk metrics and exposure',
    taskType: 'risk',
    buildPayload: (_args, _opts) => ({}),
  });
}
