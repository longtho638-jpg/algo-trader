// Calibrate command — dispatches calibrate task to CalibrateAgent via AgentDispatcher
// Usage: algo calibrate [--db-path <path>]

import type { Command } from 'commander';
import type { AgentDispatcher } from '../../agents/agent-dispatcher.js';
import { registerCommand } from '../../agents/command-registry.js';

export function createCalibrateCommand(program: Command, dispatcher: AgentDispatcher): Command {
  return registerCommand(program, dispatcher, {
    name: 'calibrate',
    description: 'Calibrate strategy parameters using historical trade data',
    taskType: 'calibrate',
    options: [
      { flags: '--db-path <path>', description: 'path to SQLite database file (overrides config)' },
    ],
    buildPayload: (_args, opts) => ({
      dbPath: opts['db-path'],
    }),
  });
}
