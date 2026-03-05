import { ExchangeConnectionPool } from './exchange-connection-pool';

describe('ExchangeConnectionPool', () => {
  let pool: ExchangeConnectionPool<{ id: string; created: number }>;

  beforeEach(() => {
    pool = new ExchangeConnectionPool(
      (id) => ({ id, created: Date.now() }),
      { maxIdleMs: 100, maxAgeMs: 500, cleanupIntervalMs: 50 }
    );
  });

  afterEach(() => {
    pool.destroy();
  });

  it('creates new connection on first acquire', () => {
    const client = pool.acquire('binance');
    expect(client.id).toBe('binance');
  });

  it('reuses existing connection on second acquire', () => {
    const first = pool.acquire('binance');
    const second = pool.acquire('binance');
    expect(first).toBe(second);
  });

  it('creates separate connections per exchange', () => {
    const binance = pool.acquire('binance');
    const okx = pool.acquire('okx');
    expect(binance.id).toBe('binance');
    expect(okx.id).toBe('okx');
    expect(binance).not.toBe(okx);
  });

  it('releases connection', () => {
    pool.acquire('binance');
    pool.release('binance');
    const stats = pool.stats();
    expect(stats.size).toBe(0);
  });

  it('reports stats correctly', () => {
    pool.acquire('binance');
    pool.acquire('okx');
    pool.acquire('binance'); // reuse
    const stats = pool.stats();
    expect(stats.size).toBe(2);
    const binanceStats = stats.connections.find(c => c.id === 'binance');
    expect(binanceStats?.uses).toBe(2);
  });

  it('evicts stale connections after maxAge', async () => {
    pool.acquire('binance');
    // Wait for maxAge (500ms) + cleanup interval (50ms)
    await new Promise(r => setTimeout(r, 600));
    const stats = pool.stats();
    expect(stats.size).toBe(0);
  });

  it('replaces stale connection on acquire', async () => {
    const first = pool.acquire('binance');
    // Wait for maxAge
    await new Promise(r => setTimeout(r, 550));
    const second = pool.acquire('binance');
    expect(second).not.toBe(first);
  });

  it('destroy clears pool', () => {
    pool.acquire('binance');
    pool.acquire('okx');
    pool.destroy();
    expect(pool.stats().size).toBe(0);
  });
});
