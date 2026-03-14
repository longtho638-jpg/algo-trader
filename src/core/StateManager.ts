// src/core/StateManager.ts
// Persist bot state for crash recovery (atomic write)
import fs from 'fs';
import path from 'path';

const STATE_FILE = path.join(process.cwd(), 'data', 'bot-state.json');

export interface BotPersistentState {
  processedSignalKeys: string[];
  lastHeartbeatId: string;
  lastSaveTime: number;
  inventories: Record<string, { yesInventory: number; noInventory: number }>;
}

export function saveState(state: BotPersistentState): void {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = STATE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, STATE_FILE); // atomic write
  } catch (e: any) {
    console.error('[State] Save failed:', e.message);
  }
}

export function loadState(): BotPersistentState | null {
  try {
    if (!fs.existsSync(STATE_FILE)) return null;
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch { return null; }
}

export function clearState(): void {
  try { if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE); } catch {}
}
