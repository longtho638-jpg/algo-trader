/**
 * Test for AbiTrade CLI Commands
 * Validates that the CLI commands are registered and accessible
 */

import { Command } from 'commander';
import { registerAbiTradeCommands } from '../../src/cli/abi-trade-commands';

describe('AbiTrade CLI Commands', () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    registerAbiTradeCommands(program);
  });

  it('should register abitrade:deepscan command', () => {
    const cmd = program.commands.find(c => c.name() === 'abitrade:deepscan');
    expect(cmd).toBeDefined();
    expect(cmd!.description()).toContain('AbiTrade Bot deep scan');
  });

  it('should register abitrade:analyze command', () => {
    const cmd = program.commands.find(c => c.name() === 'abitrade:analyze');
    expect(cmd).toBeDefined();
    expect(cmd!.description()).toContain('AbiTrade Bot market analysis');
  });

  it('should have expected options for abitrade:deepscan command', () => {
    const cmd = program.commands.find(c => c.name() === 'abitrade:deepscan');
    expect(cmd).toBeDefined();

    const options = cmd!.options;
    expect(options.some(opt => opt.flags.includes('--pairs'))).toBe(true);
    expect(options.some(opt => opt.flags.includes('--exchanges'))).toBe(true);
    expect(options.some(opt => opt.flags.includes('--size'))).toBe(true);
    expect(options.some(opt => opt.flags.includes('--threshold'))).toBe(true);
    expect(options.some(opt => opt.flags.includes('--deep-scan'))).toBe(true);
  });

  it('should have expected options for abitrade:analyze command', () => {
    const cmd = program.commands.find(c => c.name() === 'abitrade:analyze');
    expect(cmd).toBeDefined();

    const options = cmd!.options;
    expect(options.some(opt => opt.flags.includes('--pairs'))).toBe(true);
    expect(options.some(opt => opt.flags.includes('--exchanges'))).toBe(true);
    expect(options.some(opt => opt.flags.includes('--correlation-threshold'))).toBe(true);
  });
});