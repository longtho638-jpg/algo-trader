import { describe, it, expect, beforeEach } from 'vitest';

// CommandRegistry is a singleton — we need fresh instances per test.
// Import the module and reset internal state.
let CommandRegistry: any;

beforeEach(async () => {
  // Force fresh module load to reset singleton
  vi.resetModules();
  const mod = await import('../../src/trading-room/command-registry.js');
  CommandRegistry = mod.CommandRegistry;
});

import { vi } from 'vitest';

describe('CommandRegistry', () => {
  it('should return a singleton', async () => {
    const r1 = CommandRegistry.getInstance();
    const r2 = CommandRegistry.getInstance();
    expect(r1).toBe(r2);
  });

  it('should register and retrieve commands', () => {
    const reg = CommandRegistry.getInstance();
    reg.register({ name: 'status', description: 'Show status', requiredArgs: [], handler: async () => 'ok' });
    expect(reg.get('status')?.name).toBe('status');
  });

  it('should throw on duplicate registration', () => {
    const reg = CommandRegistry.getInstance();
    const def = { name: 'dup', description: 'test', requiredArgs: [], handler: async () => '' };
    reg.register(def);
    expect(() => reg.register(def)).toThrow('already registered');
  });

  it('should list all commands', () => {
    const reg = CommandRegistry.getInstance();
    reg.register({ name: 'a', description: 'A cmd', requiredArgs: [], handler: async () => '' });
    reg.register({ name: 'b', description: 'B cmd', requiredArgs: [], handler: async () => '' });
    const list = reg.listAll();
    expect(list).toHaveLength(2);
    expect(list[0].name).toBe('a');
  });

  it('should return help text for known command', () => {
    const reg = CommandRegistry.getInstance();
    reg.register({ name: 'trade', description: 'Trade ops', requiredArgs: ['strategy'], subcommands: ['start', 'stop'], handler: async () => '' });
    const help = reg.getHelp('trade');
    expect(help).toContain('/trade');
    expect(help).toContain('--strategy');
    expect(help).toContain('start | stop');
  });

  it('should return error for unknown command help', () => {
    const reg = CommandRegistry.getInstance();
    expect(reg.getHelp('nope')).toContain('Unknown command');
  });

  it('should execute /help to list commands', async () => {
    const reg = CommandRegistry.getInstance();
    reg.register({ name: 'foo', description: 'Foo cmd', requiredArgs: [], handler: async () => '' });
    const result = await reg.execute('/help');
    expect(result).toContain('Available commands');
    expect(result).toContain('/foo');
  });

  it('should execute /help <command>', async () => {
    const reg = CommandRegistry.getInstance();
    reg.register({ name: 'bar', description: 'Bar cmd', requiredArgs: [], handler: async () => '' });
    const result = await reg.execute('/help bar');
    expect(result).toContain('/bar');
  });

  it('should execute handler for registered command', async () => {
    const reg = CommandRegistry.getInstance();
    reg.register({ name: 'ping', description: 'Ping', requiredArgs: [], handler: async () => 'pong' });
    const result = await reg.execute('/ping');
    expect(result).toBe('pong');
  });

  it('should return error for unknown command execution', async () => {
    const reg = CommandRegistry.getInstance();
    const result = await reg.execute('/unknown');
    expect(result).toContain('Unknown command');
  });

  it('should return error for non-slash input', async () => {
    const reg = CommandRegistry.getInstance();
    const result = await reg.execute('hello');
    expect(result).toContain('Commands must start with /');
  });

  it('should validate required args before executing', async () => {
    const reg = CommandRegistry.getInstance();
    reg.register({ name: 'run', description: 'Run', requiredArgs: ['mode'], handler: async () => 'ran' });
    const result = await reg.execute('/run');
    expect(result).toContain('Validation error');
    expect(result).toContain('--mode');
  });
});
