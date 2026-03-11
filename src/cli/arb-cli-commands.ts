/**
 * Arbitrage CLI commands — entry point that registers all arb:* subcommands.
 * Delegates to split command modules:
 *   - arb-scan-run-commands          (arb:scan, arb:run)
 *   - arb-engine-orchestrator-commands (arb:engine, arb:orchestrator)
 *   - arb-agi-auto-execution-commands  (arb:agi, arb:auto)
 */

import { Command } from 'commander';
import { registerArbScan, registerArbRun } from './arb-scan-run-commands';
import { registerArbEngine, registerArbOrchestrator } from './arb-engine-orchestrator-commands';
import { registerArbAgi, registerArbAuto } from './arb-agi-auto-execution-commands';

export function registerArbCommands(program: Command): void {
  registerArbScan(program);
  registerArbRun(program);
  registerArbEngine(program);
  registerArbOrchestrator(program);
  registerArbAuto(program);
  registerArbAgi(program);
}
