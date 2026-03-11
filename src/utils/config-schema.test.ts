import { validateConfig, TradingConfigSchema, ExchangeCredentialsSchema } from './config-schema';

describe('ExchangeCredentialsSchema', () => {
  it('accepts valid credentials', () => {
    const result = ExchangeCredentialsSchema.safeParse({
      EXCHANGE_API_KEY: 'abcdefghij1234567890',
      EXCHANGE_SECRET: 'secretkey1234567890',
    });
    expect(result.success).toBe(true);
  });

  it('rejects short API key', () => {
    const result = ExchangeCredentialsSchema.safeParse({
      EXCHANGE_API_KEY: 'short',
      EXCHANGE_SECRET: 'secretkey1234567890',
    });
    expect(result.success).toBe(false);
  });
});

describe('TradingConfigSchema', () => {
  it('parses with defaults', () => {
    const result = TradingConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.EXCHANGE_ID).toBe('binance');
      expect(result.data.TRADING_PAIR).toBe('BTC/USDT');
      expect(result.data.TIMEFRAME).toBe('1h');
      expect(result.data.RSI_PERIOD).toBe(14);
    }
  });

  it('validates TRADING_PAIR format', () => {
    const result = TradingConfigSchema.safeParse({ TRADING_PAIR: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('rejects MAX_POSITION_SIZE > 1', () => {
    const result = TradingConfigSchema.safeParse({ MAX_POSITION_SIZE: '2' });
    expect(result.success).toBe(false);
  });
});

describe('validateConfig', () => {
  it('throws on missing credentials', () => {
    expect(() => validateConfig({ NODE_ENV: 'test' } as unknown as NodeJS.ProcessEnv)).toThrow(
      'Config validation failed'
    );
  });

  it('passes with valid full config', () => {
    const env = {
      EXCHANGE_API_KEY: 'abcdefghij1234567890',
      EXCHANGE_SECRET: 'secretkey1234567890',
      EXCHANGE_ID: 'binance',
      TRADING_PAIR: 'ETH/USDT',
      TIMEFRAME: '4h',
      RSI_PERIOD: '21',
      SMA_SHORT: '10',
      SMA_LONG: '30',
      MAX_POSITION_SIZE: '0.05',
      STOP_LOSS_PCT: '3',
      TAKE_PROFIT_PCT: '6',
      MAX_DAILY_LOSS: '10',
      LOG_LEVEL: 'debug',
    } as unknown as NodeJS.ProcessEnv;
    const config = validateConfig(env);
    expect(config.TRADING_PAIR).toBe('ETH/USDT');
    expect(config.RSI_PERIOD).toBe(21);
  });
});
