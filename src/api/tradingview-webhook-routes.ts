// TradingView webhook REST API route handlers
// POST /api/webhooks/tradingview/:userId  — receive TV alert (public, secret via X-TV-Secret header)
// POST /api/tv/generate-secret            — generate new TV webhook secret (JWT required)
// GET  /api/tv/my-webhook                 — get webhook URL + setup instructions (JWT required)
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { UserStore } from '../users/user-store.js';
import type { AuthenticatedRequest } from './auth-middleware.js';
import { sendJson, readJsonBody } from './http-response-helpers.js';
import {
  generateWebhookSecret,
  validateWebhookSecret,
  processAndEmitSignal,
} from '../webhooks/tradingview-handler.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Read raw request body as string (needed for text-format TV alerts) */
function readRawBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Derive the public base URL for webhook URLs */
function getBaseUrl(): string {
  return process.env['PUBLIC_URL'] ?? 'http://localhost:3000';
}

// ─── Route handlers ───────────────────────────────────────────────────────────

/**
 * POST /api/webhooks/tradingview/:userId
 * Public endpoint — TradingView sends alert here with X-TV-Secret header.
 * Validates secret, parses signal, emits to EventBus.
 * Responds quickly (TV has a 3s timeout).
 */
async function handleTvAlert(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  userStore: UserStore,
): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method Not Allowed' });
    return;
  }

  // Validate per-user secret from X-TV-Secret header
  const providedSecret = req.headers['x-tv-secret'];
  if (!providedSecret || typeof providedSecret !== 'string') {
    sendJson(res, 401, { error: 'Unauthorized', message: 'Missing X-TV-Secret header' });
    return;
  }

  if (!validateWebhookSecret(userId, providedSecret, userStore)) {
    sendJson(res, 401, { error: 'Unauthorized', message: 'Invalid X-TV-Secret' });
    return;
  }

  // Read and process body — respond immediately to avoid TV timeout
  let rawBody: string;
  try {
    rawBody = await readRawBody(req);
  } catch {
    sendJson(res, 400, { error: 'Bad Request', message: 'Failed to read request body' });
    return;
  }

  if (!rawBody.trim()) {
    sendJson(res, 400, { error: 'Bad Request', message: 'Empty request body' });
    return;
  }

  const signal = processAndEmitSignal(userId, rawBody);
  if (!signal) {
    sendJson(res, 400, { error: 'Bad Request', message: 'Invalid signal format' });
    return;
  }

  // Respond 200 quickly — heavy processing happens via EventBus asynchronously
  sendJson(res, 200, { ok: true, ticker: signal.ticker, action: signal.action });
}

/**
 * POST /api/tv/generate-secret
 * JWT-authenticated. Generates and stores a new TV webhook secret for the caller.
 * Returns { secret, webhookUrl }.
 */
async function handleGenerateSecret(
  req: AuthenticatedRequest,
  res: ServerResponse,
  userStore: UserStore,
): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method Not Allowed' });
    return;
  }

  const userId = req.user?.id;
  if (!userId) {
    sendJson(res, 401, { error: 'Unauthorized', message: 'Authentication required' });
    return;
  }

  const secret = generateWebhookSecret();
  const updated = userStore.updateTvWebhookSecret(userId, secret);
  if (!updated) {
    sendJson(res, 404, { error: 'Not Found', message: 'User not found' });
    return;
  }

  const webhookUrl = `${getBaseUrl()}/api/webhooks/tradingview/${userId}`;
  sendJson(res, 200, { secret, webhookUrl });
}

/**
 * GET /api/tv/my-webhook
 * JWT-authenticated. Returns webhook URL and TradingView setup instructions.
 */
function handleMyWebhook(
  req: AuthenticatedRequest,
  res: ServerResponse,
): void {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method Not Allowed' });
    return;
  }

  const userId = req.user?.id;
  if (!userId) {
    sendJson(res, 401, { error: 'Unauthorized', message: 'Authentication required' });
    return;
  }

  const webhookUrl = `${getBaseUrl()}/api/webhooks/tradingview/${userId}`;
  sendJson(res, 200, {
    webhookUrl,
    instructions: {
      step1: 'In TradingView, open your strategy and go to Alerts.',
      step2: `Set Webhook URL to: ${webhookUrl}`,
      step3: 'Add header X-TV-Secret with your secret (from POST /api/tv/generate-secret).',
      step4: 'Set alert message to JSON: {"ticker":"{{ticker}}","action":"{{strategy.order.action}}","price":{{strategy.order.price}},"time":"{{time}}"}',
      note:  'Or use text format: "{{ticker}} {{strategy.order.action}} @ {{strategy.order.price}}"',
    },
  });
}

// ─── Route dispatcher ─────────────────────────────────────────────────────────

/**
 * Dispatch TradingView-related routes.
 * @param req  - incoming HTTP request
 * @param res  - server response
 * @param pathname - parsed pathname
 * @param userStore - user data store
 * @returns true if route was handled, false to fall through to 404
 */
export async function handleTradingViewRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  userStore: UserStore,
): Promise<boolean> {
  // Public webhook endpoint: /api/webhooks/tradingview/:userId
  const tvWebhookMatch = /^\/api\/webhooks\/tradingview\/([^/]+)$/.exec(pathname);
  if (tvWebhookMatch) {
    const userId = decodeURIComponent(tvWebhookMatch[1]!);
    await handleTvAlert(req, res, userId, userStore);
    return true;
  }

  // Authenticated TV config endpoints
  if (pathname === '/api/tv/generate-secret') {
    await handleGenerateSecret(req as AuthenticatedRequest, res, userStore);
    return true;
  }

  if (pathname === '/api/tv/my-webhook') {
    handleMyWebhook(req as AuthenticatedRequest, res);
    return true;
  }

  return false;
}
