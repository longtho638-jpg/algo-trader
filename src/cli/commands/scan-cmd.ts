// Scan command — dispatches scan task to ScannerAgent via AgentDispatcher
// Usage: algo scan [--category <cat>] [--limit <n>]

import type { Command } from 'commander';
import type { AgentDispatcher } from '../../agents/agent-dispatcher.js';
import { registerCommand } from '../../agents/command-registry.js';

export function createScanCommand(program: Command, dispatcher: AgentDispatcher): Command {
  return registerCommand(program, dispatcher, {
    name: 'scan',
    description: 'Scan markets for trading opportunities',
    taskType: 'scan',
    options: [
      { flags: '--category <cat>', description: 'filter by market category (e.g. crypto, forex)' },
      { flags: '--limit <n>', description: 'max number of results to return', defaultValue: '10' },
    ],
    buildPayload: (_args, opts) => ({
      category: opts['category'],
      limit: parseInt(opts['limit'] ?? '10', 10),
    }),
  });
}
