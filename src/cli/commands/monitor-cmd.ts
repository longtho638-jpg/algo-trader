// Monitor command — dispatches monitor task to MonitorAgent via AgentDispatcher
// Usage: algo monitor [--json]

import type { Command } from 'commander';
import type { AgentDispatcher } from '../../agents/agent-dispatcher.js';
import { registerCommand } from '../../agents/command-registry.js';

export function createMonitorCommand(program: Command, dispatcher: AgentDispatcher): Command {
  return registerCommand(program, dispatcher, {
    name: 'monitor',
    description: 'Monitor active positions and market conditions',
    taskType: 'monitor',
    options: [
      { flags: '--json', description: 'output raw JSON instead of formatted table' },
    ],
    buildPayload: (_args, opts) => ({
      json: opts['json'] === 'true' || opts['json'] === '',
    }),
  });
}
