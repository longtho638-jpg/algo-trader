// src/strategies/mm/FairValueStore.ts
// Hot-reload store for operator fair value estimates.
// Operator edits data/fair-values.json — bot picks up changes without restart.

import fs from 'fs';
import path from 'path';

export type Confidence = 'low' | 'medium' | 'high';

export interface FairValueEntry {
  value: number;
  confidence: Confidence;
  spread_override: number | null;
  notes?: string;
  updated?: string;
}

interface FairValueFile {
  markets: Record<string, FairValueEntry>;
  defaults: {
    min_confidence_to_quote: Confidence;
    spread_by_confidence: Record<Confidence, number>;
  };
}

const CONFIDENCE_RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };
const DEFAULT_SPREADS: Record<Confidence, number> = { high: 0.06, medium: 0.08, low: 0.12 };

export class FairValueStore {
  private filePath: string;
  private data: FairValueFile | null = null;
  private lastMtime = 0;

  constructor(filePath?: string) {
    this.filePath = filePath ?? path.join(process.cwd(), 'data', 'fair-values.json');
  }

  /** Check file mtime and re-read only if modified. Call before each quoteMarket. */
  reload(): void {
    try {
      const stat = fs.statSync(this.filePath);
      const mtime = stat.mtimeMs;
      if (mtime === this.lastMtime) return;
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      this.data = JSON.parse(raw) as FairValueFile;
      this.lastMtime = mtime;
    } catch {
      // File missing or malformed — silently stay with last known data
    }
  }

  /**
   * Look up fair value by slug (preferred) or conditionId fallback.
   * Returns null if no entry exists or confidence is below threshold.
   */
  get(slug: string, conditionId?: string): FairValueEntry | null {
    if (!this.data) return null;
    const entry = this.data.markets[slug] ?? (conditionId ? this.data.markets[conditionId] : undefined);
    if (!entry) return null;
    if (!this.meetsMinConfidence(entry.confidence)) return null;
    return entry;
  }

  /** Spread to use for given confidence level. */
  getSpread(confidence: Confidence): number {
    return this.data?.defaults?.spread_by_confidence?.[confidence] ?? DEFAULT_SPREADS[confidence];
  }

  /** True if confidence meets or exceeds the configured minimum threshold. */
  meetsMinConfidence(confidence: Confidence): boolean {
    const min = this.data?.defaults?.min_confidence_to_quote ?? 'low';
    return CONFIDENCE_RANK[confidence] >= CONFIDENCE_RANK[min];
  }

  /** Number of markets with operator estimates loaded. */
  get marketCount(): number {
    return this.data ? Object.keys(this.data.markets).length : 0;
  }
}
