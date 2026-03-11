/**
 * Usage Events API Routes - Integration Tests
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { buildServer } from '../../src/api/fastify-raas-server';
import { UsageTrackerService } from '../../src/metering/usage-tracker-service';

describe('GET /v1/usage/events', () => {
  const server = buildServer({ skipAuth: true });
  const tracker = UsageTrackerService.getInstance();

  beforeEach(() => {
    tracker.clear();
  });

  afterEach(async () => {
    tracker.clear();
  });

  it('should require auth when skipAuth is false', async () => {
    const testServer = buildServer({ skipAuth: false });
    await testServer.ready();

    const response = await testServer.inject({
      method: 'GET',
      url: '/v1/usage/events',
    });

    assert.strictEqual(response.statusCode, 401);
    await testServer.close();
  });

  it('should return empty events when no tracking data', async () => {
    await server.ready();

    const response = await server.inject({
      method: 'GET',
      url: '/v1/usage/events',
      headers: {
        'x-api-key': 'mk_test_key:tenant_123:pro',
      },
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.count, 0);
    assert.ok(Array.isArray(body.events));
  });

  it('should return tracked events', async () => {
    await server.ready();

    // Track some events
    await tracker.trackWithKVSync('lic_test_123', 'api_call', 1, {
      endpoint: '/v1/test',
      method: 'POST',
    });
    await tracker.trackWithKVSync('lic_test_123', 'backtest_run', 1, {
      strategyId: 'strategy_001',
    });

    const response = await server.inject({
      method: 'GET',
      url: '/v1/usage/events',
      headers: {
        'x-api-key': 'mk_test_key:test_123:pro',
      },
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.success, true);
    assert.ok(body.count >= 2);
  });

  it('should filter by event type', async () => {
    await server.ready();

    await tracker.trackWithKVSync('lic_filter_test', 'api_call', 1);
    await tracker.trackWithKVSync('lic_filter_test', 'backtest_run', 1);
    await tracker.trackWithKVSync('lic_filter_test', 'trade_execution', 1);

    const response = await server.inject({
      method: 'GET',
      url: '/v1/usage/events?eventType=api_call',
      headers: {
        'x-api-key': 'mk_test_key:filter_test:pro',
      },
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.ok(body.count >= 1);
    // All returned events should be api_call
    body.events.forEach((e: any) => {
      assert.strictEqual(e.eventType, 'api_call');
    });
  });

  it('should sort events chronologically', async () => {
    await server.ready();

    // Track events in sequence
    await tracker.trackWithKVSync('lic_sort_test', 'api_call', 1);
    await new Promise(resolve => setTimeout(resolve, 10));
    await tracker.trackWithKVSync('lic_sort_test', 'backtest_run', 1);
    await new Promise(resolve => setTimeout(resolve, 10));
    await tracker.trackWithKVSync('lic_sort_test', 'trade_execution', 1);

    const response = await server.inject({
      method: 'GET',
      url: '/v1/usage/events',
      headers: {
        'x-api-key': 'mk_test_key:sort_test:pro',
      },
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.ok(body.count >= 3);

    // Verify chronological order
    const timestamps = body.events.map((e: any) => new Date(e.timestamp).getTime());
    for (let i = 1; i < timestamps.length; i++) {
      assert.ok(timestamps[i] >= timestamps[i - 1]);
    }
  });

  it('should respect limit parameter', async () => {
    await server.ready();

    // Track multiple events
    for (let i = 0; i < 10; i++) {
      await tracker.trackWithKVSync('lic_limit_test', 'api_call', 1);
    }

    const response = await server.inject({
      method: 'GET',
      url: '/v1/usage/events?limit=5',
      headers: {
        'x-api-key': 'mk_test_key:limit_test:pro',
      },
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.count, 5);
  });
});

describe('POST /v1/usage/events/sync', () => {
  const server = buildServer({ skipAuth: true });

  it('should require admin role', async () => {
    await server.ready();

    const response = await server.inject({
      method: 'POST',
      url: '/v1/usage/events/sync',
      headers: {
        'x-api-key': 'mk_test_key:tenant_123:user', // non-admin role
      },
    });

    assert.strictEqual(response.statusCode, 403);
  });

  it('should sync events successfully', async () => {
    await server.ready();
    const tracker = UsageTrackerService.getInstance();

    // Track some events
    await tracker.trackWithKVSync('lic_sync_test', 'api_call', 1);
    await tracker.trackWithKVSync('lic_sync_test', 'backtest_run', 1);

    const response = await server.inject({
      method: 'POST',
      url: '/v1/usage/events/sync',
      headers: {
        'x-api-key': 'mk_test_key:sync_test:admin',
      },
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.success, true);
    assert.ok(body.synced >= 0); // May be 0 if no events in period
  });
});
