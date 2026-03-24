#!/usr/bin/env node
// Auto-Resolution Cron — runs every 6h via launchd on M1 Max
// Checks Gamma API for resolved markets, updates paper_trades_v3
// Triggers monitoring report at milestones (10, 20, 30 resolved)
// BINH_PHAP Section 5.3: Monitoring Schedule
// Usage: node scripts/cron-check-resolutions.mjs [db-path]

import { execSync } from 'child_process';

const GAMMA_API = 'https://gamma-api.polymarket.com/markets';
const MILESTONES = [10, 20, 30, 50];

async function fetchMarket(conditionId, slug) {
  // Try slug first (more reliable), fallback to conditionId
  for (const [param, value] of [['slug', slug], ['condition_id', conditionId]]) {
    if (!value) continue;
    try {
      const url = `${GAMMA_API}?${param}=${encodeURIComponent(value)}&limit=1`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      const markets = await res.json();
      if (markets[0]) return markets[0];
    } catch { /* continue */ }
  }
  return null;
}

function getOutcome(m) {
  if (!m?.resolved) return null;
  if (m.outcome === 'Yes' || m.outcome === 'YES') return 'YES';
  if (m.outcome === 'No' || m.outcome === 'NO') return 'NO';
  if (m.outcomePrices) {
    try {
      const p = typeof m.outcomePrices === 'string' ? JSON.parse(m.outcomePrices) : m.outcomePrices;
      if (parseFloat(p[0]) >= 0.99) return 'YES';
      if (parseFloat(p[1]) >= 0.99) return 'NO';
    } catch { /* skip */ }
  }
  return null;
}

function isCorrect(direction, outcome) {
  const dir = direction.toUpperCase();
  return (dir.includes('YES') && outcome === 'YES') || (dir.includes('NO') && outcome === 'NO');
}

async function main() {
  const dbPath = process.argv[2] || 'data/algo-trade.db';
  const Database = (await import('better-sqlite3')).default;
  const db = new Database(dbPath);

  const ts = new Date().toISOString();
  console.log(`[${ts}] Cron resolution check starting...`);

  // Count current resolved
  const { before } = db.prepare('SELECT COUNT(*) as before FROM paper_trades_v3 WHERE resolved = 1').get();

  // Get unresolved actionable trades
  const trades = db.prepare(
    `SELECT * FROM paper_trades_v3 WHERE resolved = 0 AND direction != 'SKIP' ORDER BY id`
  ).all();

  if (trades.length === 0) {
    console.log('No unresolved trades to check.');
    db.close();
    return;
  }

  console.log(`Checking ${trades.length} unresolved trades...`);

  const updateStmt = db.prepare(
    `UPDATE paper_trades_v3 SET resolved = 1, outcome = ?, correct = ?, resolved_at = ? WHERE id = ?`
  );

  let newResolved = 0;

  for (const trade of trades) {
    const market = await fetchMarket(trade.conditionId, trade.slug);
    const outcome = getOutcome(market);

    if (outcome) {
      const correct = isCorrect(trade.direction, outcome) ? 1 : 0;
      updateStmt.run(outcome, correct, Date.now(), trade.id);
      newResolved++;
      console.log(`  Resolved: ${trade.question?.slice(0, 60)} → ${outcome} (${correct ? 'CORRECT' : 'WRONG'})`);
    }

    // Rate limit: 200ms between API calls
    await new Promise(r => setTimeout(r, 200));
  }

  const totalResolved = before + newResolved;
  console.log(`\nNew resolved: ${newResolved}, Total resolved: ${totalResolved}`);

  // Check milestones — trigger monitoring report
  for (const milestone of MILESTONES) {
    if (before < milestone && totalResolved >= milestone) {
      console.log(`\n🎯 Milestone reached: ${milestone} resolved trades!`);
      console.log('Triggering monitoring report...');
      try {
        const scriptDir = new URL('.', import.meta.url).pathname;
        execSync(`node ${scriptDir}monitor-deepseek-behavior.mjs ${dbPath}`, {
          stdio: 'inherit',
          timeout: 60000,
        });
      } catch (err) {
        console.error('Monitor script failed:', err.message);
      }
    }
  }

  // Quick accuracy summary
  if (totalResolved > 0) {
    const stats = db.prepare(
      `SELECT COUNT(*) as total, SUM(correct) as wins FROM paper_trades_v3 WHERE resolved = 1`
    ).get();
    const accuracy = (stats.wins / stats.total * 100).toFixed(1);
    console.log(`\n📊 Accuracy: ${stats.wins}/${stats.total} = ${accuracy}%`);

    // GO/NO-GO check
    if (totalResolved >= 30) {
      const go = stats.wins / stats.total >= 0.55;
      console.log(go
        ? '✅ GO — Accuracy >= 55%, ready for Phase 2 (live trading)'
        : '❌ NO-GO — Accuracy < 55%, continue paper trading + optimize'
      );
    }
  }

  db.close();
  console.log(`[${new Date().toISOString()}] Cron check complete.`);
}

main().catch(err => {
  console.error('Cron check failed:', err);
  process.exit(1);
});
