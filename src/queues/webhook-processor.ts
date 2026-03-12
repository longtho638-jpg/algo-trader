/**
 * Webhook Queue Processor
 * Handles webhook event processing (Polar, exchanges, etc.)
 */

import type { Env } from '../api/gateway';

interface WebhookJob {
  id: string;
  source: 'polar' | 'exchange' | 'internal';
  event_type: string;
  payload: Record<string, unknown>;
  signature?: string;
}

export async function processWebhookJob(
  body: unknown,
  env: Env
): Promise<void> {
  const job = body as WebhookJob;

  console.log(`[webhook-queue] Processing job ${job.id}`, {
    source: job.source,
    event: job.event_type,
  });

  try {
    // Verify signature if provided
    if (job.signature && job.source === 'polar') {
      const valid = await verifyPolarSignature(job.payload, job.signature, env.POLAR_WEBHOOK_SECRET);
      if (!valid) {
        throw new Error('Invalid webhook signature');
      }
    }

    // Route to appropriate handler
    switch (job.event_type) {
      case 'payment.succeeded':
        await handlePaymentSucceeded(job.payload, env);
        break;
      case 'payment.failed':
        await handlePaymentFailed(job.payload, env);
        break;
      case 'subscription.created':
        await handleSubscriptionCreated(job.payload, env);
        break;
      default:
        console.log(`[webhook-queue] Unknown event type: ${job.event_type}`);
    }

    console.log(`[webhook-queue] Job ${job.id} completed`);
  } catch (error) {
    console.error(`[webhook-queue] Job ${job.id} failed:`, error);
    throw error; // Triggers retry/DLQ
  }
}

async function verifyPolarSignature(
  payload: Record<string, unknown>,
  signature: string,
  secret?: string
): Promise<boolean> {
  // TODO: Implement Polar webhook signature verification
  console.log('[webhook-queue] Verifying Polar signature (stub)');
  return true; // Stub - always valid for now
}

async function handlePaymentSucceeded(
  payload: Record<string, unknown>,
  env: Env
): Promise<void> {
  console.log('[webhook-queue] Payment succeeded:', payload);
  // TODO: Update subscription status in database
}

async function handlePaymentFailed(
  payload: Record<string, unknown>,
  env: Env
): Promise<void> {
  console.log('[webhook-queue] Payment failed:', payload);
  // TODO: Notify customer, retry logic
}

async function handleSubscriptionCreated(
  payload: Record<string, unknown>,
  env: Env
): Promise<void> {
  console.log('[webhook-queue] Subscription created:', payload);
  // TODO: Activate subscription in database
}
