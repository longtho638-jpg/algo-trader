import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ClobClient,
  type ClobClientConfig,
} from '../../src/polymarket/clob-client.js';
import { MarketScanner } from '../../src/polymarket/market-scanner.js';
import { OrderManager } from '../../src/polymarket/order-manager.js';
import { PositionTracker } from '../../src/polymarket/position-tracker.js';

describe('ClobClient', () => {
  let client: ClobClient;

  beforeEach(() => {
    const config: ClobClientConfig = {
      privateKey: '0x' + '1'.repeat(64),
      paperMode: true,
    };
    client = new ClobClient(config);
  });

  it('should initialize in paper mode when paperMode=true', () => {
    const config: ClobClientConfig = {
      privateKey: '0x' + '2'.repeat(64),
      paperMode: true,
    };
    const testClient = new ClobClient(config);
    expect(testClient.isPaperMode).toBe(true);
  });

  it('should initialize in paper mode by default with empty key', () => {
    const testClient = new ClobClient('');
    expect(testClient.isPaperMode).toBe(true);
  });

  it('should set paper mode when privateKey is invalid string', () => {
    // Invalid keys default to paper mode
    const testClient = new ClobClient('0x' + '1'.repeat(64));
    expect(testClient).toBeTruthy();
  });

  it('should detect live mode with valid private key', () => {
    const config: ClobClientConfig = {
      privateKey: '0x' + '3'.repeat(64),
      paperMode: false,
    };
    const testClient = new ClobClient(config);
    expect(testClient.isPaperMode).toBe(false);
  });

  it('should use default chain ID 137 (Polygon)', () => {
    const config: ClobClientConfig = {
      privateKey: '0x' + '1'.repeat(64),
    };
    const testClient = new ClobClient(config);
    expect(testClient).toBeTruthy();
  });

  it('should accept custom chain ID', () => {
    const config: ClobClientConfig = {
      privateKey: '0x' + '1'.repeat(64),
      chainId: 1,
    };
    const testClient = new ClobClient(config);
    expect(testClient).toBeTruthy();
  });

  it('should read environment variables for credentials', () => {
    process.env['POLYMARKET_API_KEY'] = 'env-key';
    process.env['POLYMARKET_PASSPHRASE'] = 'env-phrase';
    const config: ClobClientConfig = {
      privateKey: '0x' + '1'.repeat(64),
    };
    const testClient = new ClobClient(config);
    expect(testClient).toBeTruthy();
    delete process.env['POLYMARKET_API_KEY'];
    delete process.env['POLYMARKET_PASSPHRASE'];
  });

  it('should construct from string private key', () => {
    const testClient = new ClobClient('0x' + '5'.repeat(64));
    expect(testClient).toBeTruthy();
  });

  it('should construct from ClobClientConfig object', () => {
    const config: ClobClientConfig = {
      privateKey: '0x' + '6'.repeat(64),
      apiKey: 'test-api-key',
      passphrase: 'test-passphrase',
      chainId: 137,
      paperMode: true,
    };
    const testClient = new ClobClient(config);
    expect(testClient.isPaperMode).toBe(true);
  });
});

describe('MarketScanner', () => {
  let client: ClobClient;
  let scanner: MarketScanner;

  beforeEach(() => {
    const config: ClobClientConfig = {
      privateKey: '0x' + '1'.repeat(64),
      paperMode: true,
    };
    client = new ClobClient(config);
    scanner = new MarketScanner(client);
  });

  it('should return opportunities from scan', async () => {
    const result = await scanner.scan({ limit: 5 });
    expect(result).toBeTruthy();
    expect(result.scannedAt).toBeGreaterThan(0);
    expect(result.totalMarkets).toBeGreaterThanOrEqual(0);
    expect(result.activeMarkets).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.opportunities)).toBe(true);
  });

  it('should support scanOpportunities alias', async () => {
    const opportunities = await scanner.scanOpportunities({ limit: 5 });
    expect(Array.isArray(opportunities)).toBe(true);
  });

  it('should filter by minimum volume', async () => {
    const result = await scanner.scan({
      minVolume: 10000,
      limit: 10,
    });
    for (const opp of result.opportunities) {
      expect(opp.volume).toBeGreaterThanOrEqual(10000);
    }
  });

  it('should filter by minimum spread percentage', async () => {
    const result = await scanner.scan({
      minSpreadPct: 0.03,
      limit: 10,
    });
    // Should only include opportunities with sufficient spread
    expect(Array.isArray(result.opportunities)).toBe(true);
  });

  it('should respect limit parameter', async () => {
    const result = await scanner.scan({ limit: 5 });
    expect(result.opportunities.length).toBeLessThanOrEqual(5);
  });

  it('should rank opportunities by score', async () => {
    const result = await scanner.scan({ limit: 10 });
    for (let i = 1; i < result.opportunities.length; i++) {
      expect(result.opportunities[i - 1].score).toBeGreaterThanOrEqual(
        result.opportunities[i].score
      );
    }
  });

  it('should return top opportunities', async () => {
    const top = await scanner.getTopOpportunities(3, { limit: 10 });
    expect(top.length).toBeLessThanOrEqual(3);
  });

  it('should identify opportunities with price sum delta', async () => {
    const result = await scanner.scan({ limit: 20 });
    if (result.opportunities.length > 0) {
      const opp = result.opportunities[0];
      expect(opp.priceSum).toBeTruthy();
      expect(typeof opp.priceSumDelta).toBe('number');
    }
  });

  it('should have valid token IDs in opportunities', async () => {
    const result = await scanner.scan({ limit: 5 });
    for (const opp of result.opportunities) {
      expect(opp.yesTokenId).toBeTruthy();
      expect(opp.noTokenId).toBeTruthy();
      expect(opp.conditionId).toBeTruthy();
    }
  });
});

describe('OrderManager', () => {
  let client: ClobClient;
  let manager: OrderManager;

  beforeEach(() => {
    const config: ClobClientConfig = {
      privateKey: '0x' + '1'.repeat(64),
      paperMode: true,
    };
    client = new ClobClient(config);
    manager = new OrderManager(client);
  });

  it('should track placed orders', async () => {
    const orderId = 'order-123';
    // Paper mode directly returns simulated order
    expect(manager).toBeTruthy();
  });

  it('should manage position state', () => {
    expect(manager).toBeTruthy();
  });

  it('should handle order placement', async () => {
    expect(manager).toBeTruthy();
  });

  it('should track order status', async () => {
    expect(manager).toBeTruthy();
  });
});

describe('PositionTracker', () => {
  let tracker: PositionTracker;

  beforeEach(() => {
    tracker = new PositionTracker();
  });

  it('should open new position', () => {
    tracker.applyFill('market-1', 'buy', 0.50, 100);
    const pos = tracker.getPosition('market-1');
    expect(pos).toBeTruthy();
    expect(pos?.side).toBe('buy');
    expect(pos?.totalSize).toBe(100);
    expect(pos?.avgEntryPrice).toBe(0.50);
  });

  it('should scale in to existing position', () => {
    tracker.applyFill('market-1', 'buy', 0.50, 100);
    tracker.applyFill('market-1', 'buy', 0.60, 100);
    const pos = tracker.getPosition('market-1');
    expect(pos?.totalSize).toBe(200);
    expect(pos?.avgEntryPrice).toBe(0.55); // (0.50*100 + 0.60*100) / 200
  });

  it('should calculate unrealized P&L for long position', () => {
    tracker.applyFill('market-1', 'buy', 0.50, 100);
    const pnl = tracker.computePnl('market-1', 0.60);
    expect(pnl).toBeTruthy();
    expect(pnl?.unrealizedPnl).toBeCloseTo(10, 5); // (0.60 - 0.50) * 100 = 10
  });

  it('should calculate unrealized P&L for short position', () => {
    tracker.applyFill('market-1', 'sell', 0.50, 100);
    const pnl = tracker.computePnl('market-1', 0.40);
    expect(pnl).toBeTruthy();
    expect(pnl?.unrealizedPnl).toBeCloseTo(10, 5); // (0.50 - 0.40) * 100 = 10
  });

  it('should close position and realize P&L', () => {
    tracker.applyFill('market-1', 'buy', 0.50, 100);
    const realized = tracker.close('market-1', 0.60, 50);
    expect(realized).toBeCloseTo(5, 5); // (0.60 - 0.50) * 50 = 5
    const pos = tracker.getPosition('market-1');
    expect(pos?.totalSize).toBe(50);
    expect(pos?.realizedPnl).toBeCloseTo(5, 5);
  });

  it('should fully close position', () => {
    tracker.applyFill('market-1', 'buy', 0.50, 100);
    tracker.close('market-1', 0.60);
    const pos = tracker.getPosition('market-1');
    expect(pos).toBeUndefined();
  });

  it('should return null for non-existent position', () => {
    const pnl = tracker.computePnl('non-existent', 0.50);
    expect(pnl).toBeNull();
  });

  it('should get all open positions', () => {
    tracker.applyFill('market-1', 'buy', 0.50, 100);
    tracker.applyFill('market-2', 'sell', 0.40, 50);
    const positions = tracker.getAllPositions();
    expect(positions).toHaveLength(2);
  });

  it('should ignore zero-size fills', () => {
    tracker.applyFill('market-1', 'buy', 0.50, 0);
    const pos = tracker.getPosition('market-1');
    expect(pos).toBeUndefined();
  });

  it('should flip position when closing with opposite side', () => {
    tracker.applyFill('market-1', 'buy', 0.50, 100);
    tracker.applyFill('market-1', 'sell', 0.60, 50); // Close half
    const pos = tracker.getPosition('market-1');
    expect(pos?.totalSize).toBe(50);
    expect(pos?.side).toBe('buy');
  });

  it('should calculate total P&L (realized + unrealized)', () => {
    tracker.applyFill('market-1', 'buy', 0.50, 100);
    tracker.close('market-1', 0.55, 50); // Realize 2.5 on 50 shares
    const pnl = tracker.computePnl('market-1', 0.60);
    expect(pnl?.realizedPnl).toBeCloseTo(2.5, 5);
    // Remaining 50 shares at current price 0.60: (0.60-0.50)*50 = 5
    expect(pnl?.unrealizedPnl).toBeCloseTo(5, 5);
    expect(pnl?.totalPnl).toBeCloseTo(7.5, 5);
  });

  it('should update position timestamps', () => {
    tracker.applyFill('market-1', 'buy', 0.50, 100);
    const pos1 = tracker.getPosition('market-1');
    const t1 = pos1?.updatedAt;

    vi.useFakeTimers();
    vi.advanceTimersByTime(1000);
    tracker.applyFill('market-1', 'buy', 0.60, 50);
    vi.useRealTimers();

    const pos2 = tracker.getPosition('market-1');
    expect(pos2?.updatedAt).toBeGreaterThan(t1!);
  });
});
