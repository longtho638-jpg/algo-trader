// src/core/state-manager.ts
// Crash recovery: persist bot state to disk with atomic write (tmp + rename)

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface BotPersistentState {
  openOrders: string[];               // order IDs
  positions: Record<string, number>;  // tokenId -> size
  processedSignalKeys: string[];      // idempotency keys
  lastHeartbeatId: string;
  dailyPnl: number;
  lastSaveTime: number;
}

const STATE_PATH = path.resolve(process.cwd(), 'data', 'bot-state.json');

function ensureDataDir(): void {
  const dir = path.dirname(STATE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function saveState(state: BotPersistentState): void {
  try {
    ensureDataDir();
    const json = JSON.stringify({ ...state, lastSaveTime: Date.now() }, null, 2);
    // Atomic write: write to temp file then rename
    const tmp = path.join(os.tmpdir(), `bot-state-${Date.now()}.tmp`);
    fs.writeFileSync(tmp, json, 'utf8');
    fs.renameSync(tmp, STATE_PATH);
  } catch (err) {
    // Non-fatal — log only
    console.error('[StateManager] Failed to save state:', err instanceof Error ? err.message : String(err));
  }
}

export function loadState(): BotPersistentState | null {
  try {
    if (!fs.existsSync(STATE_PATH)) return null;
    const raw = fs.readFileSync(STATE_PATH, 'utf8');
    return JSON.parse(raw) as BotPersistentState;
  } catch {
    return null;
  }
}

export function clearState(): void {
  try {
    if (fs.existsSync(STATE_PATH)) {
      fs.unlinkSync(STATE_PATH);
    }
  } catch {
    // ignore
  }
}
