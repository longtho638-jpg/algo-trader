// Polar payment funnel route handlers: checkout creation + webhook ingestion
// Mounts at: POST /api/checkout, POST /api/webhooks/polar
import type { IncomingMessage, ServerResponse } from 'node:http';
import { PolarClient } from '../billing/polar-client.js';
import { handlePolarWebhook } from '../billing/polar-webhook.js';
import { productIdToTier, tierToProductId } from '../billing/polar-product-map.js';
import type { UserStore } from '../users/user-store.js';
import type { Tier } from '../users/subscription-tier.js';

// ─── Shared helpers ────────────────────────────────────────────────────────

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

/** Read raw body as a string (needed for HMAC verification — no pre-parsing) */
async function readRawBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function getPolarClient(): PolarClient {
  const token = process.env['POLAR_API_TOKEN'];
  if (!token) throw new Error('POLAR_API_TOKEN not configured');
  return new PolarClient(token);
}

// ─── POST /api/checkout ────────────────────────────────────────────────────

interface CheckoutBody {
  tier?: string;
  userId?: string;
  successUrl?: string;
  cancelUrl?: string;
}

/**
 * Create a Polar hosted checkout session.
 *
 * Body: { tier: 'pro'|'enterprise', userId: string, successUrl: string, cancelUrl?: string }
 * Response: { checkoutUrl: string, checkoutId: string }
 */
export async function handleCheckout(
  req: IncomingMessage,
  res: ServerResponse,
  userStore: UserStore,
): Promise<void> {
  let body: CheckoutBody;
  try {
    const raw = await readRawBody(req);
    body = raw ? (JSON.parse(raw) as CheckoutBody) : {};
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON body' });
    return;
  }

  const { tier, userId, successUrl } = body;

  if (!tier || !userId || !successUrl) {
    sendJson(res, 400, { error: 'Missing required fields: tier, userId, successUrl' });
    return;
  }

  if (!['pro', 'enterprise'].includes(tier)) {
    sendJson(res, 400, { error: 'Invalid tier. Must be "pro" or "enterprise"' });
    return;
  }

  const user = userStore.getUserById(userId);
  if (!user) {
    sendJson(res, 404, { error: 'User not found' });
    return;
  }

  try {
    const polar = getPolarClient();
    const productId = tierToProductId(tier as Tier);

    // Polar checkout requires a price ID; we use product ID as price ID
    // since the product map holds the product-level ID from the config
    const checkout = await polar.createCheckout(productId, successUrl, user.email);

    sendJson(res, 200, { checkoutUrl: checkout.url, checkoutId: checkout.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendJson(res, 502, { error: 'Failed to create checkout', message });
  }
}

// ─── POST /api/webhooks/polar ─────────────────────────────────────────────

/**
 * Receive and process Polar webhook events.
 * HMAC verification is performed before any state mutation.
 *
 * Handled events:
 *   subscription.created  → activate subscription, set tier
 *   subscription.updated  → update tier
 *   subscription.canceled → downgrade to free
 */
export async function handlePolarWebhookRoute(
  req: IncomingMessage,
  res: ServerResponse,
  userStore: UserStore,
): Promise<void> {
  const secret = process.env['POLAR_WEBHOOK_SECRET'];
  if (!secret) {
    sendJson(res, 500, { error: 'POLAR_WEBHOOK_SECRET not configured' });
    return;
  }

  // Read raw body BEFORE any parsing — HMAC is over the raw bytes
  let rawBody: string;
  try {
    rawBody = await readRawBody(req);
  } catch {
    sendJson(res, 400, { error: 'Failed to read request body' });
    return;
  }

  const signature = req.headers['webhook-signature'] as string | undefined;
  const webhookId = req.headers['webhook-id'] as string | undefined;
  const webhookTimestamp = req.headers['webhook-timestamp'] as string | undefined;

  if (!signature || !webhookId || !webhookTimestamp) {
    sendJson(res, 400, { error: 'Missing webhook headers' });
    return;
  }

  let result: ReturnType<typeof handlePolarWebhook>;
  try {
    result = handlePolarWebhook(rawBody, signature, secret, webhookId, webhookTimestamp);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendJson(res, 401, { error: 'Webhook verification failed', message });
    return;
  }

  const { event } = result;

  // Handle subscription lifecycle events
  if (
    event.type === 'subscription.created' ||
    event.type === 'subscription.updated' ||
    event.type === 'subscription.canceled'
  ) {
    const data = event.data as {
      id: string;
      customer_id: string;
      product_id: string;
      status: string;
    };

    const customerId = data.customer_id;
    const subscriptionId = data.id;

    // Resolve target tier: canceled → free, otherwise map from product
    const targetTier: Tier =
      event.type === 'subscription.canceled'
        ? 'free'
        : productIdToTier(data.product_id);

    // Find user by polar customer ID
    let user = userStore.getUserByPolarCustomerId(customerId);

    // Fallback: first webhook fires before polar_customer_id is linked.
    // Match by customer_email field from Polar event data → our user DB.
    if (!user) {
      const email = (event.data as Record<string, unknown>)['customer_email'];
      if (typeof email === 'string' && email) {
        user = userStore.getUserByEmail(email) ?? null;
      }
    }

    if (user) {
      userStore.updatePolarSubscription(user.id, targetTier, customerId, subscriptionId);
    }
  }

  sendJson(res, 200, { acknowledged: true });
}
