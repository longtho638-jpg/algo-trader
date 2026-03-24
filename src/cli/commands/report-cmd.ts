// Report command — dispatches report task to ReportAgent via AgentDispatcher
// Usage: algo report [--period daily|weekly|all]

import type { Command } from 'commander';
import type { AgentDispatcher } from '../../agents/agent-dispatcher.js';
import { registerCommand } from '../../agents/command-registry.js';

export function createReportCommand(program: Command, dispatcher: AgentDispatcher): Command {
  return registerCommand(program, dispatcher, {
    name: 'report',
    description: 'Generate trading performance report',
    taskType: 'report',
    options: [
      {
        flags: '--period <period>',
        description: 'reporting period: daily | weekly | all',
        defaultValue: 'daily',
      },
    ],
    buildPayload: (_args, opts) => ({
      period: opts['period'] ?? 'daily',
    }),
  });
}
