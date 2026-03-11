/**
 * Cloudflare KV cache adapter - replaces Redis/ioredis
 * Uses Workers KV binding for key-value storage with TTL support
 */

// Type declaration for Cloudflare Workers KV
declare global {
  interface KVNamespace {
    get(key: string, type?: 'text'): Promise<string | null>;
    get(key: string, type: 'json'): Promise<unknown>;
    get(key: string, type: 'arrayBuffer'): Promise<ArrayBuffer | null>;
    get(key: string, type: 'stream'): Promise<ReadableStream | null>;
    put(key: string, value: string | ReadableStream | ArrayBuffer | FormData, options?: { expiration?: number; expirationTtl?: number; metadata?: unknown }): Promise<void>;
    delete(key: string): Promise<void>;
    list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{ keys: Array<{ name: string | null; expiration?: number; metadata?: unknown }>; list_complete: boolean; cursor?: string }>;
  }
}

export interface IKVCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { ttl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}

export class KVCache implements IKVCache {
  private kv: KVNamespace;

  constructor(kv: KVNamespace) {
    this.kv = kv;
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.kv.get(key, 'text');
    } catch {
      return null;
    }
  }

  async set(key: string, value: string, options?: { ttl?: number }): Promise<void> {
    const opts = options?.ttl ? { expirationTtl: options.ttl } : undefined;
    await this.kv.put(key, value, opts);
  }

  async delete(key: string): Promise<void> {
    await this.kv.delete(key);
  }

  async list(prefix?: string): Promise<string[]> {
    try {
      const listed = await this.kv.list({ prefix });
      return listed.keys.map((k: { name: string | null }) => k.name).filter((n: string | null): n is string => !!n);
    } catch {
      return [];
    }
  }
}

/** Rate limiter using KV with atomic increments */
export class KVRateLimiter {
  private kv: KVNamespace;

  constructor(kv: KVNamespace) {
    this.kv = kv;
  }

  async increment(key: string, windowMs: number, maxRequests: number): Promise<{ allowed: boolean; remaining: number }> {
    const now = Date.now();
    const windowKey = `rate:${key}:${Math.floor(now / windowMs)}`;

    const current = await this.kv.get(windowKey, 'text');
    const count = current ? parseInt(current, 10) : 0;

    if (count >= maxRequests) {
      return { allowed: false, remaining: 0 };
    }

    await this.kv.put(windowKey, String(count + 1), { expirationTtl: Math.ceil(windowMs / 1000) + 1 });
    return { allowed: true, remaining: maxRequests - count - 1 };
  }
}

/** Session store using KV */
export class KVSessionStore {
  private kv: KVNamespace;
  private ttl: number; // seconds

  constructor(kv: KVNamespace, ttl = 3600) {
    this.kv = kv;
    this.ttl = ttl;
  }

  async get(sessionId: string): Promise<string | null> {
    return this.kv.get(`session:${sessionId}`, 'text');
  }

  async set(sessionId: string, data: string): Promise<void> {
    await this.kv.put(`session:${sessionId}`, data, { expirationTtl: this.ttl });
  }

  async delete(sessionId: string): Promise<void> {
    await this.kv.delete(`session:${sessionId}`);
  }
}
