import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { UserWebhookRegistry } from '../../src/webhooks/user-webhook-registry.js';

describe('Webhook Test Endpoint', () => {
  let registry: UserWebhookRegistry;
  const userId = 'user-wh-test';

  beforeEach(() => {
    registry = new UserWebhookRegistry();
  });

  it('should register a webhook', () => {
    const reg = registry.register(userId, 'https://example.com/hook', ['trade']);
    expect(reg.id).toBeTruthy();
    expect(reg.userId).toBe(userId);
    expect(reg.url).toBe('https://example.com/hook');
    expect(reg.events).toEqual(['trade']);
    expect(reg.active).toBe(true);
  });

  it('should get webhooks by user', () => {
    registry.register(userId, 'https://example.com/hook1', ['trade']);
    registry.register(userId, 'https://example.com/hook2', ['alert']);
    registry.register('other-user', 'https://other.com/hook', ['trade']);

    const hooks = registry.getByUser(userId);
    expect(hooks.length).toBe(2);
  });

  it('should send test payload to owned webhook', () => {
    const reg = registry.register(userId, 'https://example.com/hook', ['trade']);
    const sent = registry.sendTest(reg.id, userId);
    expect(sent).toBe(true);
  });

  it('should return false for non-owned webhook test', () => {
    const reg = registry.register(userId, 'https://example.com/hook', ['trade']);
    const sent = registry.sendTest(reg.id, 'wrong-user');
    expect(sent).toBe(false);
  });

  it('should return false for non-existent webhook test', () => {
    const sent = registry.sendTest('nonexistent-id', userId);
    expect(sent).toBe(false);
  });

  it('should remove webhook by id and user', () => {
    const reg = registry.register(userId, 'https://example.com/hook', ['trade']);
    const removed = registry.remove(reg.id, userId);
    expect(removed).toBe(true);
    // After removal, sendTest should fail
    expect(registry.sendTest(reg.id, userId)).toBe(false);
  });

  it('should not remove webhook owned by different user', () => {
    const reg = registry.register(userId, 'https://example.com/hook', ['trade']);
    const removed = registry.remove(reg.id, 'wrong-user');
    expect(removed).toBe(false);
  });

  it('should get stats', () => {
    registry.register(userId, 'https://example.com/hook', ['trade']);
    const stats = registry.getStats();
    expect(stats.registrations).toBe(1);
    expect(stats.deliveryStats).toBeTruthy();
  });

  it('should get delivery history', () => {
    const history = registry.getDeliveryHistory(10);
    expect(Array.isArray(history)).toBe(true);
  });

  it('should default events to trade when empty', () => {
    const reg = registry.register(userId, 'https://example.com/hook', []);
    expect(reg.events).toEqual(['trade']);
  });

  afterEach(() => {
    registry.stop();
  });
});
