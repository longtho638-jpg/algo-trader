import {
  validateTradingPair,
  validateTimeframe,
  validatePositiveNumber,
  sanitizeLogMessage,
} from './trading-input-sanitizer-and-validator';

describe('validateTradingPair', () => {
  it('accepts valid pairs', () => {
    expect(validateTradingPair('BTC/USDT')).toBe(true);
    expect(validateTradingPair('ETH/BTC')).toBe(true);
    expect(validateTradingPair('DOGE/USD')).toBe(true);
  });

  it('rejects invalid pairs', () => {
    expect(validateTradingPair('btc/usdt')).toBe(false);
    expect(validateTradingPair('BTCUSDT')).toBe(false);
    expect(validateTradingPair('')).toBe(false);
    expect(validateTradingPair('BTC/')).toBe(false);
    expect(validateTradingPair('/USDT')).toBe(false);
  });
});

describe('validateTimeframe', () => {
  it('accepts valid timeframes', () => {
    for (const tf of ['1m', '5m', '15m', '1h', '4h', '1d']) {
      expect(validateTimeframe(tf)).toBe(true);
    }
  });

  it('rejects invalid timeframes', () => {
    expect(validateTimeframe('2m')).toBe(false);
    expect(validateTimeframe('1w')).toBe(false);
    expect(validateTimeframe('')).toBe(false);
  });
});

describe('validatePositiveNumber', () => {
  it('accepts positive finite numbers', () => {
    expect(validatePositiveNumber(1)).toBe(true);
    expect(validatePositiveNumber(0.001)).toBe(true);
    expect(validatePositiveNumber(999999)).toBe(true);
  });

  it('rejects zero, negatives, NaN, Infinity', () => {
    expect(validatePositiveNumber(0)).toBe(false);
    expect(validatePositiveNumber(-1)).toBe(false);
    expect(validatePositiveNumber(NaN)).toBe(false);
    expect(validatePositiveNumber(Infinity)).toBe(false);
  });
});

describe('sanitizeLogMessage', () => {
  it('strips ANSI escape codes', () => {
    expect(sanitizeLogMessage('\x1B[31mred\x1B[0m')).toBe('red');
  });

  it('strips control characters', () => {
    expect(sanitizeLogMessage('hello\x00world')).toBe('helloworld');
    expect(sanitizeLogMessage('test\x0Bvalue')).toBe('testvalue');
  });

  it('preserves normal text', () => {
    expect(sanitizeLogMessage('BTC/USDT at $50000')).toBe('BTC/USDT at $50000');
  });

  it('trims whitespace', () => {
    expect(sanitizeLogMessage('  hello  ')).toBe('hello');
  });
});
