import { describe, it, expect } from 'vitest';
import { InvoiceTracker, type InvoiceEvent } from '../../src/billing/invoice-tracker.js';
import { createHmac } from 'node:crypto';

function makeEvent(overrides: Partial<InvoiceEvent> = {}): InvoiceEvent {
  return {
    userId: 'user-1',
    amount: 2900,
    currency: 'usd',
    status: 'paid',
    stripeInvoiceId: 'inv-1',
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeWebhookBody(type: string, customerId: string, amountPaid = 2900): string {
  return JSON.stringify({
    id: 'evt-1',
    type,
    data: { object: { id: 'inv-1', customer: customerId, amount_paid: amountPaid, currency: 'usd' } },
  });
}

function makeSignature(body: string, secret: string, timestamp = '1234567890'): string {
  const sig = createHmac('sha256', secret).update(`${timestamp}.${body}`, 'utf8').digest('hex');
  return `t=${timestamp},v1=${sig}`;
}

describe('InvoiceTracker', () => {
  it('should record payment', () => {
    const tracker = new InvoiceTracker();
    tracker.recordPayment(makeEvent());
    const history = tracker.getPaymentHistory('user-1');
    expect(history.length).toBe(1);
    expect(history[0].status).toBe('paid');
  });

  it('should record failure', () => {
    const tracker = new InvoiceTracker();
    tracker.recordFailure(makeEvent({ status: 'failed' }));
    const history = tracker.getPaymentHistory('user-1');
    expect(history[0].status).toBe('failed');
  });

  it('should return empty history for unknown user', () => {
    const tracker = new InvoiceTracker();
    expect(tracker.getPaymentHistory('nobody')).toEqual([]);
  });

  it('should return history sorted newest first', () => {
    const tracker = new InvoiceTracker();
    tracker.recordPayment(makeEvent({ timestamp: 100 }));
    tracker.recordPayment(makeEvent({ timestamp: 300 }));
    tracker.recordPayment(makeEvent({ timestamp: 200 }));
    const history = tracker.getPaymentHistory('user-1');
    expect(history[0].timestamp).toBe(300);
    expect(history[2].timestamp).toBe(100);
  });

  it('should verify valid webhook signature', () => {
    const tracker = new InvoiceTracker();
    const secret = 'whsec_test123';
    const body = '{"test":true}';
    const sig = makeSignature(body, secret);
    expect(tracker.verifyWebhookSignature(body, sig, secret)).toBe(true);
  });

  it('should reject invalid webhook signature', () => {
    const tracker = new InvoiceTracker();
    expect(tracker.verifyWebhookSignature('body', 't=123,v1=invalid', 'secret')).toBe(false);
  });

  it('should reject missing signature parts', () => {
    const tracker = new InvoiceTracker();
    expect(tracker.verifyWebhookSignature('body', 'malformed', 'secret')).toBe(false);
  });

  it('should handle invoice.paid webhook', () => {
    const tracker = new InvoiceTracker();
    const secret = 'whsec_test';
    tracker.registerCustomer('cus-1', 'user-1');
    const body = makeWebhookBody('invoice.paid', 'cus-1');
    const sig = makeSignature(body, secret);
    const event = tracker.handleWebhook(body, sig, secret);
    expect(event?.status).toBe('paid');
    expect(event?.userId).toBe('user-1');
  });

  it('should handle invoice.payment_failed webhook', () => {
    const tracker = new InvoiceTracker();
    const secret = 'whsec_test';
    tracker.registerCustomer('cus-2', 'user-2');
    const body = makeWebhookBody('invoice.payment_failed', 'cus-2');
    const sig = makeSignature(body, secret);
    const event = tracker.handleWebhook(body, sig, secret);
    expect(event?.status).toBe('failed');
  });

  it('should return null for unknown event type', () => {
    const tracker = new InvoiceTracker();
    const secret = 'whsec_test';
    tracker.registerCustomer('cus-1', 'user-1');
    const body = makeWebhookBody('customer.created', 'cus-1');
    const sig = makeSignature(body, secret);
    const event = tracker.handleWebhook(body, sig, secret);
    expect(event).toBeNull();
  });

  it('should return null for unknown customer', () => {
    const tracker = new InvoiceTracker();
    const secret = 'whsec_test';
    const body = makeWebhookBody('invoice.paid', 'unknown-cus');
    const sig = makeSignature(body, secret);
    const event = tracker.handleWebhook(body, sig, secret);
    expect(event).toBeNull();
  });

  it('should throw on invalid webhook signature', () => {
    const tracker = new InvoiceTracker();
    expect(() => tracker.handleWebhook('body', 't=1,v1=bad', 'secret')).toThrow('signature verification failed');
  });
});
