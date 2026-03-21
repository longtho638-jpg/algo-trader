// SQLite persistence layer for issued license keys
// Uses better-sqlite3 for synchronous database operations

import Database from 'better-sqlite3';
import type { LicensePayload } from './license-generator.js';

export interface LicenseRow {
  key: string;
  userId: string;
  tier: string;
  issuedAt: number;
  expiresAt: number;
  revoked: number; // 0 = active, 1 = revoked
}

/** Singleton DB handle — initialized on first use */
let db: InstanceType<typeof Database> | null = null;

/**
 * Initialize (or reuse) the SQLite connection and ensure schema exists.
 * dbPath defaults to ':memory:' for testing convenience.
 */
export function initLicenseStore(dbPath = ':memory:'): void {
  if (db) return; // already initialized
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS licenses (
      key        TEXT PRIMARY KEY,
      userId     TEXT NOT NULL,
      tier       TEXT NOT NULL,
      issuedAt   INTEGER NOT NULL,
      expiresAt  INTEGER NOT NULL,
      revoked    INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_licenses_userId ON licenses (userId);
  `);
}

/** Get the active DB handle, throwing if not initialized. */
function getDb(): InstanceType<typeof Database> {
  if (!db) {
    // Auto-init with in-memory DB when not explicitly configured
    initLicenseStore();
  }
  return db!;
}

/**
 * Persist a newly issued license key and its payload metadata.
 * Silently replaces on conflict (idempotent re-issue).
 */
export function saveLicense(key: string, payload: LicensePayload): void {
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO licenses (key, userId, tier, issuedAt, expiresAt, revoked)
       VALUES (?, ?, ?, ?, ?, 0)`,
    )
    .run(key, payload.userId, payload.tier, payload.issuedAt, payload.expiresAt);
}

/**
 * Look up a license row by its key string.
 * Returns undefined when not found.
 */
export function getLicenseByKey(key: string): LicenseRow | undefined {
  return getDb()
    .prepare('SELECT * FROM licenses WHERE key = ?')
    .get(key) as LicenseRow | undefined;
}

/**
 * Return all license rows (active or revoked) belonging to a user.
 * Ordered by issuedAt descending (newest first).
 */
export function getLicensesByUser(userId: string): LicenseRow[] {
  return getDb()
    .prepare('SELECT * FROM licenses WHERE userId = ? ORDER BY issuedAt DESC')
    .all(userId) as LicenseRow[];
}

/**
 * Soft-revoke a license key.
 * Returns true if the row existed and was updated.
 */
export function revokeLicense(key: string): boolean {
  const result = getDb()
    .prepare('UPDATE licenses SET revoked = 1 WHERE key = ?')
    .run(key);
  return result.changes > 0;
}

/**
 * Return all licenses that are neither revoked nor expired.
 * Uses current wall-clock time for expiry comparison.
 */
export function getActiveLicenses(): LicenseRow[] {
  const now = Date.now();
  return getDb()
    .prepare(
      'SELECT * FROM licenses WHERE revoked = 0 AND expiresAt > ? ORDER BY expiresAt ASC',
    )
    .all(now) as LicenseRow[];
}

/** Close and reset the DB connection (useful in tests). */
export function closeLicenseStore(): void {
  db?.close();
  db = null;
}
