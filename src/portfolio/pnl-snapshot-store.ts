// P&L snapshot persistence — stores daily portfolio snapshots to SQLite
// Used for tracking performance over time, generating charts, and reporting

import Database from 'better-sqlite3';

export interface PnlSnapshot {
  date: string; // YYYY-MM-DD
  totalEquity: string;
  unrealizedPnl: string;
  realizedPnl: string;
  openPositions: number;
  tradeCount: number;
  winRate: number; // 0-100
  timestamp: number;
}

let db: InstanceType<typeof Database> | null = null;

export function initPnlSnapshotStore(dbPath = 'data/pnl-snapshots.db'): void {
  if (db) return;
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS pnl_snapshots (
      date           TEXT PRIMARY KEY,
      totalEquity    TEXT NOT NULL DEFAULT '0',
      unrealizedPnl  TEXT NOT NULL DEFAULT '0',
      realizedPnl    TEXT NOT NULL DEFAULT '0',
      openPositions  INTEGER NOT NULL DEFAULT 0,
      tradeCount     INTEGER NOT NULL DEFAULT 0,
      winRate        REAL NOT NULL DEFAULT 0,
      timestamp      INTEGER NOT NULL
    );
  `);
}

function getDb(): InstanceType<typeof Database> {
  if (!db) initPnlSnapshotStore();
  return db!;
}

/** Save or update today's snapshot (upsert) */
export function savePnlSnapshot(snapshot: PnlSnapshot): void {
  getDb()
    .prepare(`INSERT OR REPLACE INTO pnl_snapshots
      (date, totalEquity, unrealizedPnl, realizedPnl, openPositions, tradeCount, winRate, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      snapshot.date, snapshot.totalEquity, snapshot.unrealizedPnl,
      snapshot.realizedPnl, snapshot.openPositions, snapshot.tradeCount,
      snapshot.winRate, snapshot.timestamp,
    );
}

/** Get snapshots for a date range (inclusive) */
export function getSnapshots(fromDate: string, toDate: string): PnlSnapshot[] {
  return getDb()
    .prepare('SELECT * FROM pnl_snapshots WHERE date >= ? AND date <= ? ORDER BY date ASC')
    .all(fromDate, toDate) as PnlSnapshot[];
}

/** Get the last N snapshots */
export function getRecentSnapshots(limit = 30): PnlSnapshot[] {
  return getDb()
    .prepare('SELECT * FROM pnl_snapshots ORDER BY date DESC LIMIT ?')
    .all(limit) as PnlSnapshot[];
}

/** Get today's snapshot or null */
export function getTodaySnapshot(): PnlSnapshot | null {
  const today = new Date().toISOString().slice(0, 10);
  return (getDb()
    .prepare('SELECT * FROM pnl_snapshots WHERE date = ?')
    .get(today) as PnlSnapshot | undefined) ?? null;
}

export function closePnlSnapshotStore(): void {
  db?.close();
  db = null;
}
