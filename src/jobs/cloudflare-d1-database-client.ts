/**
 * Cloudflare D1 Database Client - replaces Prisma/PostgreSQL
 * Uses Workers D1 binding for SQLite database
 */

export interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
  meta?: { duration?: number; rows_read?: number; rows_written?: number };
}

/**
 * Database client wrapper for D1
 */
export class D1DatabaseClient {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  /**
   * Execute a raw SQL query
   */
  async exec(sql: string, bindings?: unknown[]): Promise<D1Result<unknown>> {
    const stmt = bindings ? this.db.prepare(sql).bind(...bindings) : this.db.prepare(sql);
    const result = await stmt.all();
    return {
      results: result.results as unknown[],
      success: result.success,
    };
  }

  /**
   * Execute a SELECT query
   */
  async select<T = Record<string, unknown>>(sql: string, bindings?: unknown[]): Promise<T[]> {
    const stmt = bindings ? this.db.prepare(sql).bind(...bindings) : this.db.prepare(sql);
    const result = await stmt.all<T>();
    return result.results;
  }

  /**
   * Execute an INSERT query and return the last inserted row
   */
  async insert<T = unknown>(sql: string, bindings?: unknown[]): Promise<T | null> {
    const stmt = bindings ? this.db.prepare(sql).bind(...bindings) : this.db.prepare(sql);
    const result = await stmt.run();
    if (!result.success) {
      return null;
    }

    // Get the last inserted row using last_insert_rowid()
    const selectStmt = this.db.prepare(`SELECT last_insert_rowid() as rowid`);
    const rowidResult = await selectStmt.first<{ rowid: number }>();
    if (rowidResult?.rowid) {
      const selectStmt = this.db.prepare(`SELECT * FROM ${this.extractTableName(sql)} WHERE rowid = ?`);
      const rowResult = await selectStmt.bind(rowidResult.rowid).first<T>();
      return rowResult;
    }

    return null;
  }

  /**
   * Execute an UPDATE query
   */
  async update(sql: string, bindings?: unknown[]): Promise<number> {
    const stmt = bindings ? this.db.prepare(sql).bind(...bindings) : this.db.prepare(sql);
    const result = await stmt.run();
    return result.changes ?? 0;
  }

  /**
   * Execute a DELETE query
   */
  async delete(sql: string, bindings?: unknown[]): Promise<number> {
    const stmt = bindings ? this.db.prepare(sql).bind(...bindings) : this.db.prepare(sql);
    const result = await stmt.run();
    return result.changes ?? 0;
  }

  /**
   * Execute multiple queries in a transaction
   */
  async transaction<T>(fn: (tx: D1Transaction) => Promise<T>): Promise<T> {
    return this.db.batch((tx) => {
      return fn(tx);
    });
  }

  /**
   * Run migrations
   */
  async migrate(migrations: string[]): Promise<void> {
    for (const migration of migrations) {
      await this.exec(migration);
    }
  }

  /**
   * Extract table name from INSERT/UPDATE/DELETE SQL (simple regex)
   */
  private extractTableName(sql: string): string {
    const match = sql.match(/(?:INTO|UPDATE|FROM)\s+["`]?(\w+)["`]?/i);
    return match ? match[1] : 'unknown';
  }
}

/**
 * Transaction client for batched operations
 */
export class D1TransactionClient {
  private tx: D1Transaction;

  constructor(tx: D1Transaction) {
    this.tx = tx;
  }

  async exec(sql: string, bindings?: unknown[]): Promise<void> {
    const stmt = bindings ? this.tx.prepare(sql).bind(...bindings) : this.tx.prepare(sql);
    await stmt.run();
  }

  async select<T = Record<string, unknown>>(sql: string, bindings?: unknown[]): Promise<T[]> {
    const stmt = bindings ? this.tx.prepare(sql).bind(...bindings) : this.tx.prepare(sql);
    const result = await stmt.all<T>();
    return result.results;
  }
}

/**
 * Type declarations for Cloudflare D1
 */
declare global {
  interface D1Database {
    prepare(sql: string): D1PreparedStatement;
    batch<T>(fn: (tx: D1Transaction) => Promise<T>): Promise<T>;
  }

  interface D1PreparedStatement {
    bind(...values: unknown[]): D1PreparedStatement;
    first<T = unknown>(): Promise<T | null>;
    all<T = unknown>(): Promise<{ results: T[]; success: boolean; meta?: { duration?: number; rows_read?: number; rows_written?: number; last_row_id?: number } }>;
    run(): Promise<{ success: boolean; changes?: number; last_row_id?: number; duration?: number }>;
  }

  interface D1Transaction {
    prepare(sql: string): D1PreparedStatement;
  }
}

/**
 * Repository base class for type-safe data access
 */
export abstract class Repository<T> {
  protected db: D1DatabaseClient;

  constructor(db: D1DatabaseClient) {
    this.db = db;
  }

  abstract findById(id: string): Promise<T | null>;
  abstract findAll(limit?: number): Promise<T[]>;
  abstract create(data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T>;
  abstract update(id: string, data: Partial<T>): Promise<T | null>;
  abstract delete(id: string): Promise<boolean>;
}

/**
 * Tenant repository
 */
export class TenantRepository extends Repository<Tenant> {
  async findById(id: string): Promise<Tenant | null> {
    const results = await this.db.select<Tenant>('SELECT * FROM tenants WHERE id = ?', [id]);
    return results[0] ?? null;
  }

  async findAll(limit = 100): Promise<Tenant[]> {
    return this.db.select<Tenant>('SELECT * FROM tenants ORDER BY created_at DESC LIMIT ?', [limit]);
  }

  async create(data: Omit<Tenant, 'createdAt' | 'updatedAt'>): Promise<Tenant> {
    const sql = `
      INSERT INTO tenants (id, name, email, tier, max_strategies, max_daily_loss_usd, max_position_usd, allowed_exchanges)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const result = await this.db.insert<Tenant>(sql, [
      data.id,
      data.name,
      data.email,
      data.tier,
      data.max_strategies,
      data.max_daily_loss_usd,
      data.max_position_usd,
      JSON.stringify(data.allowed_exchanges || []),
    ]);
    return result!;
  }

  async update(id: string, data: Partial<Tenant>): Promise<Tenant | null> {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (data.name !== undefined) {
      fields.push('name = ?');
      values.push(data.name);
    }
    if (data.email !== undefined) {
      fields.push('email = ?');
      values.push(data.email);
    }
    if (data.tier !== undefined) {
      fields.push('tier = ?');
      values.push(data.tier);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    const sql = `UPDATE tenants SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
    await this.db.update(sql, values);
    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const changes = await this.db.delete('DELETE FROM tenants WHERE id = ?', [id]);
    return changes > 0;
  }
}

/**
 * Tenant type definition
 */
export interface Tenant {
  id: string;
  name: string;
  email: string | null;
  tier: 'FREE' | 'PRO' | 'ENTERPRISE';
  max_strategies: number;
  max_daily_loss_usd: number;
  max_position_usd: number;
  allowed_exchanges: string[];
  created_at: string;
  updated_at: string;
}
