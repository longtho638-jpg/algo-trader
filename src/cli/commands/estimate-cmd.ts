// Estimate command — dispatches estimate task to EstimateAgent via AgentDispatcher
// Usage: algo estimate <question>

import type { Command } from 'commander';
import type { AgentDispatcher } from '../../agents/agent-dispatcher.js';
import { registerCommand } from '../../agents/command-registry.js';

export function createEstimateCommand(program: Command, dispatcher: AgentDispatcher): Command {
  return registerCommand(program, dispatcher, {
    name: 'estimate',
    description: 'Estimate probability or edge for a trading question',
    taskType: 'estimate',
    args: '<question>',
    buildPayload: (args, _opts) => ({
      question: args[0] ?? '',
    }),
  });
}
