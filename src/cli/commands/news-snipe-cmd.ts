// NewsSnipe command — detect markets with news-driven momentum shifts
// Usage: algo news-snipe [--min-momentum <n>] [--limit <n>]

import type { Command } from 'commander';
import type { AgentDispatcher } from '../../agents/agent-dispatcher.js';
import { registerCommand } from '../../agents/command-registry.js';

export function createNewsSniperCommand(program: Command, dispatcher: AgentDispatcher): Command {
  return registerCommand(program, dispatcher, {
    name: 'news-snipe',
    description: 'Detect markets with sudden momentum shifts (news-driven price movements)',
    taskType: 'news-snipe',
    options: [
      { flags: '--min-momentum <n>', description: 'minimum momentum score to flag (default: 5.0)', defaultValue: '5.0' },
      { flags: '--limit <n>', description: 'max markets to scan', defaultValue: '100' },
    ],
    buildPayload: (_args, opts) => ({
      minMomentum: parseFloat(opts['min-momentum'] ?? '5.0'),
      limit: parseInt(opts['limit'] ?? '100', 10),
    }),
  });
}
