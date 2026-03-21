import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WebSocket } from 'ws';
import {
  ChannelManager,
  validateChannel,
  formatMessage,
  serializeMessage,
  type WsChannel,
} from '../../src/ws/ws-channels.js';
import { WsBroadcaster } from '../../src/ws/ws-broadcaster.js';
import { EventBus } from '../../src/events/event-bus.js';

describe('ChannelManager', () => {
  let manager: ChannelManager;
  let mockWs1: WebSocket;
  let mockWs2: WebSocket;

  beforeEach(() => {
    manager = new ChannelManager();
    mockWs1 = vi.fn() as unknown as WebSocket;
    mockWs2 = vi.fn() as unknown as WebSocket;
  });

  it('should initialize with all channel sets', () => {
    const channels = ['trades', 'orderbook', 'pnl', 'alerts', 'strategies', 'system'] as WsChannel[];
    for (const ch of channels) {
      const subscribers = manager.getSubscribers(ch);
      expect(subscribers).toBeDefined();
      expect(subscribers.size).toBe(0);
    }
  });

  it('should subscribe a client to a channel', () => {
    const subscribers = manager.getSubscribers('trades');
    expect(subscribers.size).toBe(0);

    manager.subscribe(mockWs1, 'trades');
    const afterSubscribe = manager.getSubscribers('trades');
    expect(afterSubscribe.size).toBe(1);
    expect(afterSubscribe.has(mockWs1)).toBe(true);
  });

  it('should unsubscribe a client from a channel', () => {
    manager.subscribe(mockWs1, 'trades');
    expect(manager.getSubscribers('trades').size).toBe(1);

    manager.unsubscribe(mockWs1, 'trades');
    expect(manager.getSubscribers('trades').size).toBe(0);
  });

  it('should unsubscribe a client from all channels', () => {
    manager.subscribe(mockWs1, 'trades');
    manager.subscribe(mockWs1, 'pnl');
    manager.subscribe(mockWs1, 'strategies');

    expect(manager.getSubscribers('trades').size).toBe(1);
    expect(manager.getSubscribers('pnl').size).toBe(1);
    expect(manager.getSubscribers('strategies').size).toBe(1);

    manager.unsubscribeAll(mockWs1);

    expect(manager.getSubscribers('trades').size).toBe(0);
    expect(manager.getSubscribers('pnl').size).toBe(0);
    expect(manager.getSubscribers('strategies').size).toBe(0);
  });

  it('should maintain isolated subscriber sets per channel', () => {
    manager.subscribe(mockWs1, 'trades');
    manager.subscribe(mockWs2, 'pnl');

    expect(manager.getSubscribers('trades').size).toBe(1);
    expect(manager.getSubscribers('trades').has(mockWs1)).toBe(true);
    expect(manager.getSubscribers('trades').has(mockWs2)).toBe(false);

    expect(manager.getSubscribers('pnl').size).toBe(1);
    expect(manager.getSubscribers('pnl').has(mockWs2)).toBe(true);
    expect(manager.getSubscribers('pnl').has(mockWs1)).toBe(false);
  });

  it('should broadcast to channel subscribers only', () => {
    const sendSpy1 = vi.fn();
    const sendSpy2 = vi.fn();

    mockWs1 = {
      readyState: WebSocket.OPEN,
      send: sendSpy1,
    } as unknown as WebSocket;

    mockWs2 = {
      readyState: WebSocket.OPEN,
      send: sendSpy2,
    } as unknown as WebSocket;

    manager.subscribe(mockWs1, 'trades');
    manager.subscribe(mockWs2, 'pnl');

    manager.broadcastToChannel('trades', { test: 'data' });

    expect(sendSpy1).toHaveBeenCalled();
    expect(sendSpy2).not.toHaveBeenCalled();
  });

  it('should skip closed websockets during broadcast', () => {
    const sendSpy = vi.fn();

    mockWs1 = {
      readyState: WebSocket.CLOSED,
      send: sendSpy,
    } as unknown as WebSocket;

    manager.subscribe(mockWs1, 'trades');
    manager.broadcastToChannel('trades', { test: 'data' });

    expect(sendSpy).not.toHaveBeenCalled();
  });
});

describe('Channel validation and formatting', () => {
  it('should validate recognized channels', () => {
    expect(validateChannel('trades')).toBe(true);
    expect(validateChannel('orderbook')).toBe(true);
    expect(validateChannel('pnl')).toBe(true);
    expect(validateChannel('alerts')).toBe(true);
    expect(validateChannel('strategies')).toBe(true);
    expect(validateChannel('system')).toBe(true);
  });

  it('should reject unrecognized channels', () => {
    expect(validateChannel('invalid-channel')).toBe(false);
    expect(validateChannel('unknown')).toBe(false);
  });

  it('should format message with channel and timestamp', () => {
    const msg = formatMessage('trades', { orderId: '123' });

    expect(msg.channel).toBe('trades');
    expect(msg.data).toEqual({ orderId: '123' });
    expect(typeof msg.timestamp).toBe('number');
    expect(msg.timestamp).toBeGreaterThan(0);
  });

  it('should serialize message to JSON string', () => {
    const msg = formatMessage('pnl', { equity: '10000' });
    const serialized = serializeMessage(msg);

    expect(typeof serialized).toBe('string');
    const parsed = JSON.parse(serialized);
    expect(parsed.channel).toBe('pnl');
    expect(parsed.data).toEqual({ equity: '10000' });
  });
});

describe('WsBroadcaster', () => {
  let broadcaster: WsBroadcaster;
  let eventBus: EventBus;
  let mockWsServer: any;

  beforeEach(() => {
    broadcaster = new WsBroadcaster();
    eventBus = new EventBus();
    mockWsServer = {
      broadcast: vi.fn(),
    };
  });

  it('should wire event bus and listen to trade events', () => {
    broadcaster.wireEventBus(eventBus, mockWsServer);

    eventBus.emit('trade.executed', {
      trade: {
        orderId: 'ord-1',
        marketId: 'market-1',
        side: 'buy',
        fillPrice: '100',
        fillSize: '10',
        fees: '0.50',
        timestamp: Date.now(),
        strategy: 'cross-market-arb',
      },
    });

    expect(mockWsServer.broadcast).toHaveBeenCalledWith(
      'trades',
      expect.objectContaining({ type: 'trade' }),
    );
  });

  it('should wire event bus and listen to PnL events', () => {
    broadcaster.wireEventBus(eventBus, mockWsServer);

    eventBus.emit('pnl.snapshot', {
      snapshot: {
        timestamp: Date.now(),
        equity: '10000',
        peakEquity: '11000',
        drawdown: 0.05,
        totalPnl: '500',
        unrealizedPnl: '200',
        realizedPnl: '300',
      },
    });

    expect(mockWsServer.broadcast).toHaveBeenCalledWith(
      'pnl',
      expect.objectContaining({ type: 'pnl' }),
    );
  });

  it('should wire event bus and listen to strategy events', () => {
    broadcaster.wireEventBus(eventBus, mockWsServer);

    eventBus.emit('strategy.started', {
      name: 'TestStrategy',
      config: {
        name: 'cross-market-arb',
        enabled: true,
        capitalAllocation: '5000',
        params: {},
      },
    });

    expect(mockWsServer.broadcast).toHaveBeenCalledWith(
      'strategies',
      expect.objectContaining({ type: 'strategy' }),
    );
  });

  it('should handle strategy error events', () => {
    broadcaster.wireEventBus(eventBus, mockWsServer);

    eventBus.emit('strategy.error', {
      name: 'TestStrategy',
      error: 'Connection failed',
    });

    expect(mockWsServer.broadcast).toHaveBeenCalledWith(
      'strategies',
      expect.objectContaining({
        type: 'strategy',
        data: expect.objectContaining({ event: 'error' }),
      }),
    );
  });

  it('should directly broadcast trade via broadcastTrade()', () => {
    broadcaster.wireEventBus(eventBus, mockWsServer);

    const trade = {
      orderId: 'ord-1',
      marketId: 'market-1',
      side: 'buy' as const,
      fillPrice: '100',
      fillSize: '10',
      fees: '0.50',
      timestamp: Date.now(),
      strategy: 'cross-market-arb' as const,
    };

    broadcaster.broadcastTrade(trade);

    expect(mockWsServer.broadcast).toHaveBeenCalledWith(
      'trades',
      expect.objectContaining({ type: 'trade', data: trade }),
    );
  });

  it('should directly broadcast PnL via broadcastPnl()', () => {
    broadcaster.wireEventBus(eventBus, mockWsServer);

    const pnl = {
      timestamp: Date.now(),
      equity: '10500',
      peakEquity: '11000',
      drawdown: 0.045,
      totalPnl: '500',
      unrealizedPnl: '200',
      realizedPnl: '300',
    };

    broadcaster.broadcastPnl(pnl);

    expect(mockWsServer.broadcast).toHaveBeenCalledWith(
      'pnl',
      expect.objectContaining({ type: 'pnl', data: pnl }),
    );
  });

  it('should directly broadcast strategy status via broadcastStrategyStatus()', () => {
    broadcaster.wireEventBus(eventBus, mockWsServer);

    broadcaster.broadcastStrategyStatus({
      name: 'MyStrategy',
      event: 'started',
      detail: 'Initialization complete',
    });

    expect(mockWsServer.broadcast).toHaveBeenCalledWith(
      'strategies',
      expect.objectContaining({
        type: 'strategy',
        data: expect.objectContaining({ event: 'started' }),
      }),
    );
  });

  it('should directly broadcast orderbook via broadcastOrderbook()', () => {
    broadcaster.wireEventBus(eventBus, mockWsServer);

    broadcaster.broadcastOrderbook({
      marketId: 'market-1',
      bids: [['100', '10'], ['99', '20']],
      asks: [['101', '15'], ['102', '25']],
      timestamp: Date.now(),
    });

    expect(mockWsServer.broadcast).toHaveBeenCalledWith(
      'orderbook',
      expect.objectContaining({ type: 'orderbook' }),
    );
  });

  it('should envelope data with type and timestamp', () => {
    broadcaster.wireEventBus(eventBus, mockWsServer);

    const trade = {
      orderId: 'ord-1',
      marketId: 'market-1',
      side: 'buy' as const,
      fillPrice: '100',
      fillSize: '10',
      fees: '0.50',
      timestamp: Date.now(),
      strategy: 'cross-market-arb' as const,
    };

    broadcaster.broadcastTrade(trade);
    const call = mockWsServer.broadcast.mock.calls[0];
    const envelope = call[1];

    expect(envelope).toHaveProperty('type');
    expect(envelope).toHaveProperty('data');
    expect(envelope).toHaveProperty('timestamp');
    expect(typeof envelope.timestamp).toBe('string');
  });

  it('should dispose event listeners on dispose()', () => {
    broadcaster.wireEventBus(eventBus, mockWsServer);
    const listenerCount = eventBus.getListenerCount('trade.executed' as any);
    expect(listenerCount).toBeGreaterThan(0);

    broadcaster.dispose();
    const afterDispose = eventBus.getListenerCount('trade.executed' as any);
    expect(afterDispose).toBe(0);
  });

  it('should allow re-wiring after dispose', () => {
    broadcaster.wireEventBus(eventBus, mockWsServer);
    broadcaster.dispose();

    const newMockServer = { broadcast: vi.fn() };
    broadcaster.wireEventBus(eventBus, newMockServer);

    eventBus.emit('trade.executed', {
      trade: {
        orderId: 'ord-1',
        marketId: 'market-1',
        side: 'buy',
        fillPrice: '100',
        fillSize: '10',
        fees: '0.50',
        timestamp: Date.now(),
        strategy: 'cross-market-arb',
      },
    });

    expect(newMockServer.broadcast).toHaveBeenCalled();
  });

  it('should work without EventBus wiring for direct broadcasts', () => {
    const mockServer = { broadcast: vi.fn() };
    broadcaster.wireEventBus(new EventBus(), mockServer);

    const trade = {
      orderId: 'ord-1',
      marketId: 'market-1',
      side: 'buy' as const,
      fillPrice: '100',
      fillSize: '10',
      fees: '0.50',
      timestamp: Date.now(),
      strategy: 'cross-market-arb' as const,
    };

    broadcaster.broadcastTrade(trade);
    expect(mockServer.broadcast).toHaveBeenCalled();
  });
});
