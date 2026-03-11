/**
 * Persistent JSON file store for tenant state with atomic writes.
 * Uses write-to-tmp + rename pattern to prevent partial writes/corruption.
 */

import * as fs from 'fs';
import * as path from 'path';

export type TenantStateRecord = Record<string, unknown>;

/**
 * Load tenant state from a JSON file.
 * Returns empty Map if file does not exist or is unreadable.
 */
export function load(filePath: string): Map<string, TenantStateRecord> {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return new Map();
    }
    const entries = Object.entries(parsed as Record<string, unknown>).map(
      ([k, v]): [string, TenantStateRecord] => [
        k,
        typeof v === 'object' && v !== null && !Array.isArray(v)
          ? (v as TenantStateRecord)
          : {},
      ],
    );
    return new Map(entries);
  } catch {
    return new Map();
  }
}

/**
 * Atomically save a Map to a JSON file.
 * Writes to <filePath>.tmp first, then renames to prevent corruption.
 */
export function save(filePath: string, data: Map<string, unknown>): void {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of data) {
    obj[k] = v;
  }
  const json = JSON.stringify(obj, null, 2);
  const tmpPath = `${filePath}.tmp`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(tmpPath, json, 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

export interface AutoSaver {
  stop(): void;
}

/**
 * Create a periodic auto-saver that flushes state on an interval.
 * Returns a handle with stop() to cancel the interval.
 */
export function createAutoSaver(
  filePath: string,
  getData: () => Map<string, unknown>,
  intervalMs = 5000,
): AutoSaver {
  const handle = setInterval(() => {
    try {
      save(filePath, getData());
    } catch {
      // Swallow — caller responsible for logging
    }
  }, intervalMs);

  // Allow Node.js to exit even if the interval is still running
  if (handle.unref) {
    handle.unref();
  }

  return {
    stop(): void {
      clearInterval(handle);
    },
  };
}
