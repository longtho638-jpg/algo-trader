/**
 * Exchange Connection Pool — Reuses exchange client instances across
 * the application to avoid redundant initialization and memory waste.
 * Tracks connection age and provides stale connection cleanup.
 */

import { logger } from '../utils/logger';

export interface PooledConnection<T> {
  client: T;
  exchangeId: string;
  createdAt: number;
  lastUsedAt: number;
  useCount: number;
}

export interface ConnectionPoolOptions {
  /** Max idle time before eviction (ms). Default: 5min */
  maxIdleMs?: number;
  /** Max connection age before forced refresh (ms). Default: 30min */
  maxAgeMs?: number;
  /** Cleanup interval (ms). Default: 60s */
  cleanupIntervalMs?: number;
}

export class ExchangeConnectionPool<T> {
  private pool = new Map<string, PooledConnection<T>>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private readonly maxIdleMs: number;
  private readonly maxAgeMs: number;

  constructor(
    private readonly factory: (exchangeId: string) => T,
    options: ConnectionPoolOptions = {},
  ) {
    this.maxIdleMs = options.maxIdleMs ?? 300_000;
    this.maxAgeMs = options.maxAgeMs ?? 1_800_000;
    const interval = options.cleanupIntervalMs ?? 60_000;
    this.cleanupTimer = setInterval(() => this.evictStale(), interval);
    this.cleanupTimer.unref();
  }

  /** Get or create a connection for an exchange */
  acquire(exchangeId: string): T {
    const existing = this.pool.get(exchangeId);
    const now = Date.now();

    if (existing && (now - existing.createdAt) < this.maxAgeMs) {
      existing.lastUsedAt = now;
      existing.useCount++;
      return existing.client;
    }

    // Create new or replace stale
    if (existing) {
      logger.info(`[Pool] Replacing stale connection: ${exchangeId}`);
    }

    const client = this.factory(exchangeId);
    this.pool.set(exchangeId, {
      client,
      exchangeId,
      createdAt: now,
      lastUsedAt: now,
      useCount: 1,
    });
    return client;
  }

  /** Remove a specific connection */
  release(exchangeId: string): void {
    this.pool.delete(exchangeId);
  }

  /** Get pool stats */
  stats(): { size: number; connections: { id: string; age: number; uses: number }[] } {
    const now = Date.now();
    return {
      size: this.pool.size,
      connections: Array.from(this.pool.values()).map(c => ({
        id: c.exchangeId,
        age: Math.round((now - c.createdAt) / 1000),
        uses: c.useCount,
      })),
    };
  }

  /** Evict idle/stale connections */
  private evictStale(): void {
    const now = Date.now();
    for (const [id, conn] of this.pool) {
      if ((now - conn.lastUsedAt) > this.maxIdleMs || (now - conn.createdAt) > this.maxAgeMs) {
        this.pool.delete(id);
        logger.info(`[Pool] Evicted: ${id} (idle ${Math.round((now - conn.lastUsedAt) / 1000)}s)`);
      }
    }
  }

  /** Shutdown pool and clear timer */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.pool.clear();
  }
}
