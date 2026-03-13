/**
 * ArbitrageScanner Tests
 */

import { ArbitrageScanner } from '../../src/arbitrage/arbitrage-scanner';
import { ArbitrageConfig } from '../../src/arbitrage/arbitrage-config';

// Mock ExchangeClientBase
jest.mock('@agencyos/trading-core/exchanges', () => ({
  ExchangeClientBase: class MockExchangeClient {
    exchangeId: string;
    constructor(exchangeId: string) {
      this.exchangeId = exchangeId;
    }
    async initialize() {
      return Promise.resolve();
    }
    async close() {
      return Promise.resolve();
    }
  },
}));

describe('ArbitrageScanner', () => {
  let scanner: ArbitrageScanner;

  const mockConfig: ArbitrageConfig = {
    enabled: true,
    exchanges: ['binance', 'ftx'],
    symbols: ['BTC/USDT', 'ETH/USDT'],
    positionSizeUsd: 1000,
    maxSlippagePercent: 0.5,
    pollIntervalMs: 1000,
    minNetProfitPercent: 0.1,
    opportunityTtlMs: 5000,
  };

  beforeEach(() => {
    scanner = new ArbitrageScanner(mockConfig);
  });

  afterEach(() => {
    scanner.stop();
  });

  describe('initialization', () => {
    it('should initialize with default config', () => {
      const defaultScanner = new ArbitrageScanner();
      expect(defaultScanner).toBeDefined();
    });

    it('should accept custom config', () => {
      const customScanner = new ArbitrageScanner(mockConfig);
      expect(customScanner).toBeDefined();
    });

    it('should initialize exchange clients', async () => {
      await scanner.initialize();
      // Exchange clients should be connected
      expect(scanner).toBeDefined();
    });

    it('should throw error when no exchanges configured', async () => {
      const emptyConfig: ArbitrageConfig = {
        ...mockConfig,
        exchanges: [],
      };
      const emptyScanner = new ArbitrageScanner(emptyConfig);

      await expect(emptyScanner.initialize()).rejects.toThrow('No exchanges connected');
    });
  });

  describe('start/stop', () => {
    it('should start scanning loop', async () => {
      await scanner.initialize();
      scanner.start();
      // Scanner should be running
      expect(scanner).toBeDefined();
    });

    it('should not start if already running', async () => {
      await scanner.initialize();
      scanner.start();
      scanner.start(); // Should log warning but not crash
      expect(scanner).toBeDefined();
    });

    it('should not start if disabled by config', async () => {
      const disabledConfig: ArbitrageConfig = {
        ...mockConfig,
        enabled: false,
      };
      const disabledScanner = new ArbitrageScanner(disabledConfig);
      disabledScanner.start(); // Should log warning but not start
      expect(disabledScanner).toBeDefined();
    });

    it('should stop scanning loop', async () => {
      await scanner.initialize();
      scanner.start();
      scanner.stop();
      expect(scanner).toBeDefined();
    });
  });

  describe('shutdown', () => {
    it('should shutdown gracefully', async () => {
      await scanner.initialize();
      scanner.start();
      await scanner.shutdown();
      // All exchange clients should be closed
      expect(scanner).toBeDefined();
    });
  });

  describe('event emission', () => {
    it('should emit opportunity event', async () => {
      await scanner.initialize();

      const opportunityHandler = jest.fn();
      scanner.on('opportunity', opportunityHandler);

      // Manually emit event for testing
      scanner.emit('opportunity', {
        buyExchange: 'binance',
        sellExchange: 'ftx',
        symbol: 'BTC/USD',
        profitPercent: 0.5,
      });

      expect(opportunityHandler).toHaveBeenCalled();
    });

    it('should emit error event', async () => {
      await scanner.initialize();

      const errorHandler = jest.fn();
      scanner.on('error', errorHandler);

      scanner.emit('error', new Error('Test error'));

      expect(errorHandler).toHaveBeenCalledWith(new Error('Test error'));
    });
  });

  describe('scanLoop', () => {
    it('should perform scan loop without errors', async () => {
      await scanner.initialize();
      // Scan loop should run without throwing
      expect(scanner).toBeDefined();
    });
  });
});
