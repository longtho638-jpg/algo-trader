// CLI entry point - Commander.js program setup
// algo: Algorithmic trading platform CLI

import { Command } from 'commander';
import { createRequire } from 'module';

// Existing commands (no dispatcher needed)
import { startCommand } from './commands/start.js';
import { statusCommand } from './commands/status.js';
import { backtestCommand } from './commands/backtest.js';
import { configCommand } from './commands/config-cmd.js';
import { hedgeScanCommand } from './commands/hedge-scan.js';

// Agent dispatcher
import { AgentDispatcher } from '../agents/agent-dispatcher.js';

// Specialist agents
import { ScannerAgent } from '../agents/scanner-agent.js';
import { MonitorAgent } from '../agents/monitor-agent.js';
import { EstimateAgent } from '../agents/estimate-agent.js';
import { RiskAgent } from '../agents/risk-agent.js';
import { CalibrateAgent } from '../agents/calibrate-agent.js';
import { ReportAgent } from '../agents/report-agent.js';
import { DoctorAgent } from '../agents/doctor-agent.js';

// Agent-dispatched command creators
import { createScanCommand } from './commands/scan-cmd.js';
import { createMonitorCommand } from './commands/monitor-cmd.js';
import { createEstimateCommand } from './commands/estimate-cmd.js';
import { createRiskCommand } from './commands/risk-cmd.js';
import { createCalibrateCommand } from './commands/calibrate-cmd.js';
import { createReportCommand } from './commands/report-cmd.js';
import { createDoctorCommand } from './commands/doctor-cmd.js';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const pkg = require('../../package.json') as { version: string; description: string };

const program = new Command();

program
  .name('algo')
  .description(pkg.description)
  .version(pkg.version)
  .option('-v, --verbose', 'enable verbose/debug logging')
  .option('--config-file <path>', 'path to .env config file (default: .env)');

// Existing commands
program.addCommand(startCommand);
program.addCommand(statusCommand);
program.addCommand(backtestCommand);
program.addCommand(configCommand);
program.addCommand(hedgeScanCommand);

// Setup dispatcher and register all specialist agents
const dispatcher = new AgentDispatcher();
dispatcher.register(new ScannerAgent());
dispatcher.register(new MonitorAgent());
dispatcher.register(new EstimateAgent());
dispatcher.register(new RiskAgent());
dispatcher.register(new CalibrateAgent());
dispatcher.register(new ReportAgent());
dispatcher.register(new DoctorAgent());

// Agent-dispatched commands
createScanCommand(program, dispatcher);
createMonitorCommand(program, dispatcher);
createEstimateCommand(program, dispatcher);
createRiskCommand(program, dispatcher);
createCalibrateCommand(program, dispatcher);
createReportCommand(program, dispatcher);
createDoctorCommand(program, dispatcher);

// Meta command: list all registered specialist agents
program
  .command('agents')
  .description('List registered specialist agents')
  .action(() => {
    console.log(JSON.stringify(dispatcher.listAgents(), null, 2));
  });

program.parse(process.argv);
