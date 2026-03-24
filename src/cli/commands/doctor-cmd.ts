// Doctor command — dispatches doctor task to DoctorAgent via AgentDispatcher
// Usage: algo doctor

import type { Command } from 'commander';
import type { AgentDispatcher } from '../../agents/agent-dispatcher.js';
import { registerCommand } from '../../agents/command-registry.js';

export function createDoctorCommand(program: Command, dispatcher: AgentDispatcher): Command {
  return registerCommand(program, dispatcher, {
    name: 'doctor',
    description: 'Run system health checks: config, database, exchange connectivity',
    taskType: 'doctor',
    buildPayload: (_args, _opts) => ({}),
  });
}
