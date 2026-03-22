import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AlgoTradeWsClient } from '../../src/sdk/sdk-ws-client.js';
import type { SignalEvent, WebSocketMessage } from '../../src/sdk/sdk-types.js';

// ─── Mock WebSocket ──────────────────────────────────────────────────────────

class MockWebSocket {
  static instances: MockWebSocket[] = [];

  url: string;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 1; // OPEN

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  close() {
    this.readyState = 3; // CLOSED
    this.onclose?.();
  }

  /** Test helper: push a raw message string */
  emit(data: string) {
    this.onmessage?.({ data });
  }
}

// ─── Setup ───────────────────────────────────────────────────────────────────

const TEST_URL = 'ws://localhost:3000/ws/signals';

beforeEach(() => {
  MockWebSocket.instances = [];
  // Replace global WebSocket with mock
  vi.stubGlobal('WebSocket', MockWebSocket);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AlgoTradeWsClient', () => {
  describe('connect / close', () => {
    it('opens a WebSocket to the given URL', () => {
      const client = new AlgoTradeWsClient();
      client.connect(TEST_URL);
      expect(MockWebSocket.instances).toHaveLength(1);
      expect(MockWebSocket.instances[0].url).toBe(TEST_URL);
    });

    it('close() prevents reconnect after server-side close', () => {
      const client = new AlgoTradeWsClient();
      client.connect(TEST_URL);
      const ws = MockWebSocket.instances[0];

      client.close();
      ws.onclose?.(); // simulate server closing after client.close()

      // Advance timers — no new WebSocket should be created
      vi.runAllTimers();
      expect(MockWebSocket.instances).toHaveLength(1);
    });
  });

  describe('onSignal callback', () => {
    it('invokes callback with SignalEvent for type=signal messages', () => {
      const client = new AlgoTradeWsClient();
      const signalCb = vi.fn();
      client.onSignal(signalCb);
      client.connect(TEST_URL);

      const signal: SignalEvent = {
        id: 'sig-1',
        strategy: 'market-maker',
        symbol: 'BTC/USDT',
        side: 'buy',
        confidence: 0.85,
        price: 65000,
        timestamp: Date.now(),
      };
      const msg: WebSocketMessage<SignalEvent> = {
        type: 'signal',
        payload: signal,
        timestamp: Date.now(),
      };

      MockWebSocket.instances[0].emit(JSON.stringify(msg));

      expect(signalCb).toHaveBeenCalledOnce();
      expect(signalCb).toHaveBeenCalledWith(signal);
    });

    it('does not invoke callback for non-signal message types', () => {
      const client = new AlgoTradeWsClient();
      const signalCb = vi.fn();
      client.onSignal(signalCb);
      client.connect(TEST_URL);

      const ping: WebSocketMessage = { type: 'ping', payload: {}, timestamp: Date.now() };
      MockWebSocket.instances[0].emit(JSON.stringify(ping));

      expect(signalCb).not.toHaveBeenCalled();
    });

    it('silently ignores malformed JSON frames', () => {
      const client = new AlgoTradeWsClient();
      const signalCb = vi.fn();
      client.onSignal(signalCb);
      client.connect(TEST_URL);

      MockWebSocket.instances[0].emit('not-json-{{{');

      expect(signalCb).not.toHaveBeenCalled();
    });
  });

  describe('onDisconnect callback', () => {
    it('invokes callback when connection closes unexpectedly', () => {
      const client = new AlgoTradeWsClient();
      const disconnectCb = vi.fn();
      client.onDisconnect(disconnectCb);
      client.connect(TEST_URL);

      MockWebSocket.instances[0].onclose?.();

      expect(disconnectCb).toHaveBeenCalledOnce();
    });
  });

  describe('auto-reconnect with backoff', () => {
    it('reconnects after server-side disconnect', () => {
      const client = new AlgoTradeWsClient();
      client.connect(TEST_URL);
      expect(MockWebSocket.instances).toHaveLength(1);

      // Simulate unexpected close
      MockWebSocket.instances[0].onclose?.();

      // First backoff = 1000ms (2^0 * 1000)
      vi.advanceTimersByTime(1_000);
      expect(MockWebSocket.instances).toHaveLength(2);
      expect(MockWebSocket.instances[1].url).toBe(TEST_URL);
    });

    it('applies exponential backoff on successive disconnects', () => {
      const client = new AlgoTradeWsClient();
      client.connect(TEST_URL);

      // Disconnect → reconnect loop twice
      MockWebSocket.instances[0].onclose?.();
      vi.advanceTimersByTime(1_000); // 2^0 * 1000 = 1000ms → reconnect #1

      MockWebSocket.instances[1].onclose?.();
      vi.advanceTimersByTime(2_000); // 2^1 * 1000 = 2000ms → reconnect #2

      expect(MockWebSocket.instances).toHaveLength(3);
    });

    it('does not reconnect after explicit close()', () => {
      const client = new AlgoTradeWsClient();
      client.connect(TEST_URL);

      client.close(); // explicit close — no reconnect
      vi.runAllTimers();

      expect(MockWebSocket.instances).toHaveLength(1);
    });
  });
});
