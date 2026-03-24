// CommandRegistry — dynamic CLI command registration via AgentDispatcher
// Bridges Commander.js commands to AgentDispatcher task dispatch

import { Command } from 'commander';
import type { AgentDispatcher } from './agent-dispatcher.js';
import type { AgentTaskType } from './agent-base.js';
import { createTask } from './agent-base.js';
import { logger } from '../core/logger.js';

export interface CommandDef {
  name: string;
  description: string;
  taskType: AgentTaskType;
  args?: string;  // e.g. '<question>' or '[market-id]'
  options?: { flags: string; description: string; defaultValue?: string }[];
  /** Transform CLI args/opts into task payload */
  buildPayload?: (args: string[], opts: Record<string, string>) => Record<string, unknown>;
}

/**
 * Register a command definition that dispatches through AgentDispatcher.
 * Returns the Commander Command for further customization if needed.
 */
export function registerCommand(program: Command, dispatcher: AgentDispatcher, def: CommandDef): Command {
  const cmdStr = def.args ? `${def.name} ${def.args}` : def.name;
  const cmd = program.command(cmdStr).description(def.description);

  for (const opt of def.options ?? []) {
    cmd.option(opt.flags, opt.description, opt.defaultValue);
  }

  cmd.action(async (...rawArgs: unknown[]) => {
    // Commander passes positional args first, then opts object, then Command
    const opts = (rawArgs.length >= 2 ? rawArgs[rawArgs.length - 2] : {}) as Record<string, string>;
    const positionalArgs = rawArgs.slice(0, -2).map(String);
    const payload = def.buildPayload
      ? def.buildPayload(positionalArgs, opts)
      : { ...opts, args: positionalArgs };

    const task = createTask(def.taskType, payload);
    try {
      const result = await dispatcher.dispatch(task);
      if (result.success) {
        printResult(result.data);
      } else {
        logger.error(`${def.name} failed: ${result.error}`, 'CLI');
        process.exitCode = 1;
      }
    } catch (err) {
      logger.error(`${def.name}: ${err instanceof Error ? err.message : String(err)}`, 'CLI');
      process.exitCode = 1;
    }
  });

  return cmd;
}

function printResult(data: unknown): void {
  if (data === null || data === undefined) return;
  if (typeof data === 'string') {
    console.log(data);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}
