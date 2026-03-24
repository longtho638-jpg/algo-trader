// Contrarian command — find herding behavior and contrarian opportunities
// Usage: algo contrarian [--min-herding <n>] [--max-price <n>] [--limit <n>]

import type { Command } from 'commander';
import type { AgentDispatcher } from '../../agents/agent-dispatcher.js';
import { registerCommand } from '../../agents/command-registry.js';

export function createContrarianCommand(program: Command, dispatcher: AgentDispatcher): Command {
  return registerCommand(program, dispatcher, {
    name: 'contrarian',
    description: 'Detect herding behavior and find contrarian opportunities',
    taskType: 'contrarian',
    options: [
      { flags: '--min-herding <n>', description: 'minimum herding intensity 0-1 (default: 0.70)', defaultValue: '0.70' },
      { flags: '--max-price <n>', description: 'max high-side price to include (default: 0.92)', defaultValue: '0.92' },
      { flags: '--limit <n>', description: 'max markets to scan', defaultValue: '100' },
    ],
    buildPayload: (_args, opts) => ({
      minHerding: parseFloat(opts['min-herding'] ?? '0.70'),
      maxPrice: parseFloat(opts['max-price'] ?? '0.92'),
      limit: parseInt(opts['limit'] ?? '100', 10),
    }),
  });
}
