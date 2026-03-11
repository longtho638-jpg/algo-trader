/**
 * Targeted tests for AbiTrade CLI Commands
 * Focus on specific functionality and error cases
 */

import { Command } from 'commander';
import { registerAbiTradeCommands } from '../../src/cli/abi-trade-commands';

describe('AbiTrade CLI Commands - Targeted Tests', () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    registerAbiTradeCommands(program);
  });

  describe('abitrade:deepscan command', () => {
    it('should have correct default values', () => {
      const cmd = program.commands.find(c => c.name() === 'abitrade:deepscan');
      expect(cmd).toBeDefined();

      // Check for default values
      const defaultOptions = {
        pairs: 'BTC/USDT,ETH/USDT',
        exchanges: 'binance,bybit,okx',
        size: '1000',
        threshold: '0.05',
        equity: '10000',
        'max-loss': '100',
        'score-threshold': '65',
        'deep-scan': 'true',
        'correlation-threshold': '0.85',
        'latency-buffer': '200',
        'max-depth': '10',
        'volatility-window': '20'
      };

      Object.entries(defaultOptions).forEach(([flag, defaultValue]) => {
        const option = cmd!.options.find(opt =>
          opt.flags.includes(`--${flag}`) || opt.flags.includes(`-${flag.charAt(0)}, --${flag}`)
        );
        expect(option).toBeDefined();
        if (option) {
          expect(option.defaultValue).toBe(defaultValue);
        }
      });
    });

    it('should have correct option types', () => {
      const cmd = program.commands.find(c => c.name() === 'abitrade:deepscan');
      expect(cmd).toBeDefined();

      // Check that numeric options exist
      const numericOptions = ['size', 'threshold', 'equity', 'max-loss', 'score-threshold',
                             'correlation-threshold', 'latency-buffer', 'max-depth', 'volatility-window'];

      numericOptions.forEach(flag => {
        const option = cmd!.options.find(opt =>
          opt.flags.includes(`--${flag}`) || opt.flags.includes(`-${flag.charAt(0)}, --${flag}`)
        );
        expect(option).toBeDefined();
      });
    });

    it('should have boolean options', () => {
      const cmd = program.commands.find(c => c.name() === 'abitrade:deepscan');
      expect(cmd).toBeDefined();

      // Check that boolean options exist
      const booleanOptions = ['paper', 'dashboard', 'deep-scan'];

      booleanOptions.forEach(flag => {
        const option = cmd!.options.find(opt =>
          opt.flags.includes(`--${flag}`)
        );
        expect(option).toBeDefined();
      });
    });
  });

  describe('abitrade:analyze command', () => {
    it('should have correct default values', () => {
      const cmd = program.commands.find(c => c.name() === 'abitrade:analyze');
      expect(cmd).toBeDefined();

      // Check for default values
      const defaultOptions = {
        pairs: 'BTC/USDT,ETH/USDT',
        exchanges: 'binance,bybit,okx',
        'correlation-threshold': '0.85',
        'volatility-window': '20',
        timeframe: '1h'
      };

      Object.entries(defaultOptions).forEach(([flag, defaultValue]) => {
        const option = cmd!.options.find(opt =>
          opt.flags.includes(`--${flag}`) || opt.flags.includes(`-${flag.charAt(0)}, --${flag}`)
        );
        expect(option).toBeDefined();
        if (option) {
          expect(option.defaultValue).toBe(defaultValue);
        }
      });
    });

    it('should have correct option types', () => {
      const cmd = program.commands.find(c => c.name() === 'abitrade:analyze');
      expect(cmd).toBeDefined();

      // Check that numeric options exist
      const numericOptions = ['correlation-threshold', 'volatility-window'];

      numericOptions.forEach(flag => {
        const option = cmd!.options.find(opt =>
          opt.flags.includes(`--${flag}`) || opt.flags.includes(`-${flag.charAt(0)}, --${flag}`)
        );
        expect(option).toBeDefined();
      });
    });
  });

  describe('Command registration validation', () => {
    it('should register both commands', () => {
      const deepscanCmd = program.commands.find(c => c.name() === 'abitrade:deepscan');
      const analyzeCmd = program.commands.find(c => c.name() === 'abitrade:analyze');

      expect(deepscanCmd).toBeDefined();
      expect(analyzeCmd).toBeDefined();

      expect(deepscanCmd!.description()).toContain('AbiTrade Bot deep scan');
      expect(analyzeCmd!.description()).toContain('AbiTrade Bot market analysis');
    });
  });
});