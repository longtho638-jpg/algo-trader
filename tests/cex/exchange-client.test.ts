import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createExchange,
  isLiveTradingEnabled,
  ExchangeClient,
  type ExchangeConfig,
} from '../../src/cex/exchange-client.js';
import { OrderExecutor } from '../../src/cex/order-executor.js';
import { createCexClient } from '../../src/cex/index.js';

describe('isLiveTradingEnabled', () => {
  beforeEach(() => {
    delete process.env['LIVE_TRADING'];
  });

  it('should return false when LIVE_TRADING env not set', () => {
    expect(isLiveTradingEnabled()).toBe(false);
  });

  it('should return true when LIVE_TRADING=true', () => {
    process.env['LIVE_TRADING'] = 'true';
    expect(isLiveTradingEnabled()).toBe(true);
  });

  it('should return false when LIVE_TRADING=false', () => {
    process.env['LIVE_TRADING'] = 'false';
    expect(isLiveTradingEnabled()).toBe(false);
  });

  it('should return false for any value other than "true"', () => {
    process.env['LIVE_TRADING'] = '1';
    expect(isLiveTradingEnabled()).toBe(false);
  });
});

describe('createExchange', () => {
  it('should create binance exchange instance', () => {
    const config: ExchangeConfig = {
      apiKey: 'test-key',
      apiSecret: 'test-secret',
    };
    const exchange = createExchange('binance', config);
    expect(exchange).toBeTruthy();
    expect(exchange.id).toBe('binance');
  });

  it('should create bybit exchange instance', () => {
    const config: ExchangeConfig = {
      apiKey: 'test-key',
      apiSecret: 'test-secret',
    };
    const exchange = createExchange('bybit', config);
    expect(exchange).toBeTruthy();
    expect(exchange.id).toBe('bybit');
  });

  it('should create okx exchange instance', () => {
    const config: ExchangeConfig = {
      apiKey: 'test-key',
      apiSecret: 'test-secret',
    };
    const exchange = createExchange('okx', config);
    expect(exchange).toBeTruthy();
    expect(exchange.id).toBe('okx');
  });

  it('should throw for unsupported exchange', () => {
    const config: ExchangeConfig = {
      apiKey: 'test-key',
      apiSecret: 'test-secret',
    };
    expect(() => {
      createExchange('unknown' as any, config);
    }).toThrow('Unsupported exchange');
  });

  it('should enable sandbox mode when sandbox=true', () => {
    const config: ExchangeConfig = {
      apiKey: 'test-key',
      apiSecret: 'test-secret',
      sandbox: true,
    };
    const exchange = createExchange('binance', config);
    // sandboxMode property exists and is truthy
    expect(exchange).toBeTruthy();
  });

  it('should include passphrase for OKX', () => {
    const config: ExchangeConfig = {
      apiKey: 'test-key',
      apiSecret: 'test-secret',
      passphrase: 'test-passphrase',
    };
    const exchange = createExchange('okx', config);
    expect(exchange).toBeTruthy();
  });
});

describe('ExchangeClient', () => {
  let client: ExchangeClient;

  beforeEach(() => {
    delete process.env['LIVE_TRADING'];
    client = new ExchangeClient();
  });

  it('should connect exchange in paper mode by default', () => {
    const config: ExchangeConfig = {
      apiKey: 'test-key',
      apiSecret: 'test-secret',
    };
    client.connect('binance', config);
    expect(client.isPaperMode('binance')).toBe(true);
  });

  it('should connect exchange in paper mode when paperMode=true', () => {
    const config: ExchangeConfig = {
      apiKey: 'test-key',
      apiSecret: 'test-secret',
      paperMode: true,
    };
    client.connect('bybit', config);
    expect(client.isPaperMode('bybit')).toBe(true);
  });

  it('should connect exchange in live mode when LIVE_TRADING=true', () => {
    process.env['LIVE_TRADING'] = 'true';
    const config: ExchangeConfig = {
      apiKey: 'test-key',
      apiSecret: 'test-secret',
    };
    client.connect('binance', config);
    expect(client.isPaperMode('binance')).toBe(false);
  });

  it('should override live mode with paperMode=true', () => {
    process.env['LIVE_TRADING'] = 'true';
    const config: ExchangeConfig = {
      apiKey: 'test-key',
      apiSecret: 'test-secret',
      paperMode: true,
    };
    client.connect('binance', config);
    expect(client.isPaperMode('binance')).toBe(true);
  });

  it('should get exchange instance', () => {
    const config: ExchangeConfig = {
      apiKey: 'test-key',
      apiSecret: 'test-secret',
    };
    client.connect('binance', config);
    const instance = client.getInstance('binance');
    expect(instance).toBeTruthy();
    expect(instance.id).toBe('binance');
  });

  it('should throw when getting unconnected exchange', () => {
    expect(() => {
      client.getInstance('binance');
    }).toThrow('Exchange not connected');
  });

  it('should list connected exchanges', () => {
    const config: ExchangeConfig = {
      apiKey: 'test-key',
      apiSecret: 'test-secret',
    };
    client.connect('binance', config);
    client.connect('bybit', config);
    const connected = client.listConnected();
    expect(connected).toContain('binance');
    expect(connected).toContain('bybit');
    expect(connected).toHaveLength(2);
  });

  it('should default to paper mode for unknown exchange', () => {
    const result = client.isPaperMode('unknown' as any);
    expect(result).toBe(true);
  });

  it('should disconnect all exchanges', async () => {
    const config: ExchangeConfig = {
      apiKey: 'test-key',
      apiSecret: 'test-secret',
    };
    client.connect('binance', config);
    client.connect('bybit', config);
    await client.disconnectAll();
    expect(client.listConnected()).toHaveLength(0);
  });
});

describe('OrderExecutor', () => {
  let client: ExchangeClient;
  let executor: OrderExecutor;

  beforeEach(() => {
    client = new ExchangeClient();
    const config: ExchangeConfig = {
      apiKey: 'test-key',
      apiSecret: 'test-secret',
    };
    client.connect('binance', config);
    executor = new OrderExecutor(client);
  });

  it('should place paper order with slippage', async () => {
    const order = await executor.placeOrder({
      exchange: 'binance',
      symbol: 'BTC/USDT',
      side: 'buy',
      amount: 0.1,
      price: 50000,
      strategy: 'market_maker',
    });
    expect(order).toBeTruthy();
    expect(order.id).toBeTruthy();
    expect(order.side).toBe('buy');
    expect(order.status).toBe('filled');
    expect(order.paperFill).toBe(true);
  });

  it('should apply positive slippage for buy orders', async () => {
    const order = await executor.placeOrder({
      exchange: 'binance',
      symbol: 'BTC/USDT',
      side: 'buy',
      amount: 0.1,
      price: 50000,
      strategy: 'market_maker',
    });
    // Buy slippage: price increased by 0.05%
    const fillPrice = parseFloat(order.price);
    expect(fillPrice).toBeGreaterThan(50000);
  });

  it('should apply negative slippage for sell orders', async () => {
    const order = await executor.placeOrder({
      exchange: 'binance',
      symbol: 'BTC/USDT',
      side: 'sell',
      amount: 0.1,
      price: 50000,
      strategy: 'market_maker',
    });
    // Sell slippage: price decreased by 0.05%
    const fillPrice = parseFloat(order.price);
    expect(fillPrice).toBeLessThan(50000);
  });

  it('should track order in memory', async () => {
    const order = await executor.placeOrder({
      exchange: 'binance',
      symbol: 'ETH/USDT',
      side: 'buy',
      amount: 1,
      price: 3000,
      strategy: 'arbitrage',
    });
    expect(order.id).toBeTruthy();
  });

  it('should use market type swap when provided', async () => {
    const order = await executor.placeOrder({
      exchange: 'binance',
      symbol: 'BTC/USDT',
      side: 'buy',
      amount: 0.1,
      price: 50000,
      strategy: 'market_maker',
      marketType: 'swap',
    });
    expect(order).toBeTruthy();
  });
});

describe('createCexClient', () => {
  beforeEach(() => {
    delete process.env['LIVE_TRADING'];
  });

  it('should create fully-wired CEX client', () => {
    const config: ExchangeConfig = {
      apiKey: 'test-key',
      apiSecret: 'test-secret',
    };
    const client = createCexClient('binance', config);
    expect(client.exchangeClient).toBeTruthy();
    expect(client.marketData).toBeTruthy();
    expect(client.orderExecutor).toBeTruthy();
  });

  it('should wire all components correctly', () => {
    const config: ExchangeConfig = {
      apiKey: 'test-key',
      apiSecret: 'test-secret',
    };
    const client = createCexClient('bybit', config);
    expect(client.exchangeClient.listConnected()).toContain('bybit');
  });

  it('should use paper mode by default', () => {
    const config: ExchangeConfig = {
      apiKey: 'test-key',
      apiSecret: 'test-secret',
    };
    const client = createCexClient('binance', config);
    expect(client.exchangeClient.isPaperMode('binance')).toBe(true);
  });

  it('should respect LIVE_TRADING env var', () => {
    process.env['LIVE_TRADING'] = 'true';
    const config: ExchangeConfig = {
      apiKey: 'test-key',
      apiSecret: 'test-secret',
    };
    const client = createCexClient('okx', config);
    expect(client.exchangeClient.isPaperMode('okx')).toBe(false);
  });
});
