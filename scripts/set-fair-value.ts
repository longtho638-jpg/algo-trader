#!/usr/bin/env ts-node
// scripts/set-fair-value.ts
// CLI tool to manage data/fair-values.json operator estimates.
//
// Usage:
//   pnpm fv:list                             — show all entries
//   pnpm fv:set <slug> <value> <conf> [notes] — add/update entry
//   pnpm fv -- remove <slug>                  — delete entry

import fs from 'fs';
import path from 'path';

type Confidence = 'low' | 'medium' | 'high';

interface FairValueEntry {
  value: number;
  confidence: Confidence;
  spread_override: number | null;
  notes?: string;
  updated: string;
}

interface FairValueFile {
  _README?: string;
  _HOWTO?: string;
  markets: Record<string, FairValueEntry>;
  defaults: {
    min_confidence_to_quote: Confidence;
    spread_by_confidence: Record<Confidence, number>;
  };
}

const FV_PATH = path.join(process.cwd(), 'data', 'fair-values.json');

function load(): FairValueFile {
  if (!fs.existsSync(FV_PATH)) {
    return {
      markets: {},
      defaults: { min_confidence_to_quote: 'low', spread_by_confidence: { high: 0.06, medium: 0.08, low: 0.12 } },
    };
  }
  return JSON.parse(fs.readFileSync(FV_PATH, 'utf-8')) as FairValueFile;
}

function save(data: FairValueFile): void {
  const dir = path.dirname(FV_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(FV_PATH, JSON.stringify(data, null, 2));
}

function cmdList(): void {
  const data = load();
  const entries = Object.entries(data.markets);
  if (entries.length === 0) {
    console.log('No fair values set. Use: pnpm fv -- set <slug> <value> <confidence>');
    return;
  }
  console.log('\nFair Values (data/fair-values.json)');
  console.log('─'.repeat(80));
  console.log('Slug'.padEnd(35), 'Value'.padEnd(8), 'Conf'.padEnd(9), 'Spread'.padEnd(9), 'Updated');
  console.log('─'.repeat(80));
  for (const [slug, e] of entries) {
    const spread = e.spread_override != null ? `${(e.spread_override * 100).toFixed(0)}¢` : 'default';
    console.log(
      slug.slice(0, 34).padEnd(35),
      e.value.toFixed(2).padEnd(8),
      e.confidence.padEnd(9),
      spread.padEnd(9),
      e.updated ?? '',
    );
    if (e.notes) console.log('  ', e.notes);
  }
  console.log('─'.repeat(80));
  console.log(`Total: ${entries.length} entries\n`);
}

function cmdSet(slug: string, rawValue: string, confidence: string, notes?: string): void {
  const value = parseFloat(rawValue);
  if (isNaN(value) || value < 0.01 || value > 0.99) {
    console.error('Error: value must be between 0.01 and 0.99');
    process.exit(1);
  }
  if (!['low', 'medium', 'high'].includes(confidence)) {
    console.error('Error: confidence must be low | medium | high');
    process.exit(1);
  }
  const data = load();
  const existing = data.markets[slug];
  data.markets[slug] = {
    value,
    confidence: confidence as Confidence,
    spread_override: existing?.spread_override ?? null,
    notes,
    updated: new Date().toISOString().slice(0, 10),
  };
  save(data);
  console.log(`Set ${slug}: value=${value.toFixed(2)}, confidence=${confidence}${notes ? `, notes="${notes}"` : ''}`);
}

function cmdRemove(slug: string): void {
  const data = load();
  if (!data.markets[slug]) {
    console.error(`Not found: ${slug}`);
    process.exit(1);
  }
  delete data.markets[slug];
  save(data);
  console.log(`Removed: ${slug}`);
}

// --- CLI dispatch ---
const [, , cmd, ...rest] = process.argv;

switch (cmd) {
  case 'list':
  case undefined:
    cmdList();
    break;
  case 'set': {
    const [slug, value, confidence, ...noteParts] = rest;
    if (!slug || !value || !confidence) {
      console.error('Usage: pnpm fv -- set <slug> <value> <confidence> [notes]');
      process.exit(1);
    }
    cmdSet(slug, value, confidence, noteParts.length ? noteParts.join(' ') : undefined);
    break;
  }
  case 'remove': {
    const [slug] = rest;
    if (!slug) {
      console.error('Usage: pnpm fv -- remove <slug>');
      process.exit(1);
    }
    cmdRemove(slug);
    break;
  }
  default:
    console.error(`Unknown command: ${cmd}. Use: list | set | remove`);
    process.exit(1);
}
