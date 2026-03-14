/**
 * Auth routes — signup, login, me, checkout.
 * In-memory user store (Map). SHA-256+salt password hashing.
 * Public routes: no API key auth required.
 */
import { createHash, randomBytes } from 'crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { signToken, verifyToken } from '../../auth/jwt-token-service';
import { generateApiKey } from '../../auth/api-key-manager';
import { logger } from '../../utils/logger';

interface UserRecord {
  email: string;
  passwordHash: string;
  salt: string;
  tenantId: string;
  tier: string;
  apiKey: string;
  apiKeyHashed: string;
  createdAt: number;
}

// In-memory store: email -> UserRecord
const userStore = new Map<string, UserRecord>();

function hashPassword(password: string, salt: string): string {
  return createHash('sha256').update(salt + password).digest('hex');
}

function generateTenantId(): string {
  return 'tenant_' + randomBytes(8).toString('hex');
}

const POLAR_CHECKOUT_URLS: Record<string, string> = {
  free: '',
  pro: process.env['POLAR_PRO_CHECKOUT_URL'] ?? 'https://polar.sh/cashclaw/checkout/pro',
  enterprise: process.env['POLAR_ENTERPRISE_CHECKOUT_URL'] ?? 'https://polar.sh/cashclaw/checkout/enterprise',
};

export async function authRoutes(server: FastifyInstance): Promise<void> {
  // POST /api/auth/signup
  server.post('/api/auth/signup', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { email?: string; password?: string; tier?: string };
    const { email, password, tier = 'free' } = body ?? {};

    if (!email || !password) {
      return reply.code(400).send({ error: 'email and password are required' });
    }
    if (password.length < 8) {
      return reply.code(400).send({ error: 'password must be at least 8 characters' });
    }
    if (userStore.has(email.toLowerCase())) {
      return reply.code(409).send({ error: 'email already registered' });
    }

    const salt = randomBytes(16).toString('hex');
    const passwordHash = hashPassword(password, salt);
    const tenantId = generateTenantId();

    const generated = generateApiKey(tenantId, ['read', 'write', 'trade'], 'default');

    const record: UserRecord = {
      email: email.toLowerCase(),
      passwordHash,
      salt,
      tenantId,
      tier,
      apiKey: generated.raw,
      apiKeyHashed: generated.hashed,
      createdAt: Date.now(),
    };
    userStore.set(email.toLowerCase(), record);

    const token = signToken({ tenantId, scopes: ['read', 'write', 'trade'] });

    logger.info(`New user signed up tenantId=${tenantId} tier=${tier}`);

    return reply.code(201).send({
      token,
      tenantId,
      email: record.email,
      tier,
      apiKey: generated.raw,
    });
  });

  // POST /api/auth/login
  server.post('/api/auth/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { email?: string; password?: string };
    const { email, password } = body ?? {};

    if (!email || !password) {
      return reply.code(400).send({ error: 'email and password are required' });
    }

    const record = userStore.get(email.toLowerCase());
    if (!record) {
      return reply.code(401).send({ error: 'invalid credentials' });
    }

    const hash = hashPassword(password, record.salt);
    if (hash !== record.passwordHash) {
      return reply.code(401).send({ error: 'invalid credentials' });
    }

    const token = signToken({ tenantId: record.tenantId, scopes: ['read', 'write', 'trade'] });

    return reply.send({
      token,
      tenantId: record.tenantId,
      email: record.email,
      tier: record.tier,
    });
  });

  // GET /api/auth/me
  server.get('/api/auth/me', async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = request.headers['authorization'];
    if (!auth?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'missing bearer token' });
    }

    let payload;
    try {
      payload = verifyToken(auth.slice(7));
    } catch {
      return reply.code(401).send({ error: 'invalid or expired token' });
    }

    // Find user by tenantId
    let found: UserRecord | undefined;
    for (const u of userStore.values()) {
      if (u.tenantId === payload.tenantId) {
        found = u;
        break;
      }
    }

    return reply.send({
      tenantId: payload.tenantId,
      email: found?.email ?? '',
      tier: found?.tier ?? 'free',
      scopes: payload.scopes,
      createdAt: found?.createdAt,
    });
  });

  // POST /api/auth/checkout
  server.post('/api/auth/checkout', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { tier?: string };
    const tier = body?.tier ?? 'pro';

    const url = POLAR_CHECKOUT_URLS[tier];
    if (!url) {
      return reply.code(400).send({ error: `no checkout URL for tier: ${tier}` });
    }

    return reply.send({ url, tier });
  });
}
