#!/usr/bin/env node
// Check resolution status of paper_trades_v3 against Polymarket Gamma API
// Uses conditionId/slug for reliable lookups (not _q search)
// Updates DB with resolution results and outputs accuracy report
// Usage: node scripts/check-batch-resolutions.mjs [db-path]

const GAMMA_API = 'https://gamma-api.polymarket.com/markets';
const PHASE2_MIN_RESOLVED = 30;
const PHASE2_MIN_ACCURACY = 0.55;
const PHASE2_MAX_BRIER = 0.25;

async function fetchBySlug(slug) {
  if (!slug) return null;
  const url = `${GAMMA_API}?slug=${encodeURIComponent(slug)}&limit=1`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const markets = await res.json();
    return markets[0] || null;
  } catch { return null; }
}

async function fetchByConditionId(conditionId) {
  if (!conditionId) return null;
  const url = `${GAMMA_API}?condition_id=${encodeURIComponent(conditionId)}&limit=1`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const markets = await res.json();
    return markets[0] || null;
  } catch { return null; }
}

function getOutcome(m) {
  if (!m) return null;
  if (!m.resolved) return null;
  if (m.outcome === 'Yes' || m.outcome === 'YES') return 'YES';
  if (m.outcome === 'No' || m.outcome === 'NO') return 'NO';
  if (m.outcomePrices) {
    try {
      const p = typeof m.outcomePrices === 'string' ? JSON.parse(m.outcomePrices) : m.outcomePrices;
      if (parseFloat(p[0]) >= 0.99) return 'YES';
      if (parseFloat(p[1]) >= 0.99) return 'NO';
    } catch {}
  }
  return null;
}

function isCorrect(direction, outcome) {
  const dir = direction.toUpperCase();
  return (dir.includes('YES') && outcome === 'YES') || (dir.includes('NO') && outcome === 'NO');
}

function computePnl(direction, marketProb, outcome, betSize = 10) {
  const dir = direction.toUpperCase();
  if (dir.includes('YES')) {
    return (outcome === 'YES' ? betSize : 0) - (betSize * marketProb);
  } else if (dir.includes('NO')) {
    return (outcome === 'NO' ? betSize : 0) - (betSize * (1 - marketProb));
  }
  return 0;
}

async function main() {
  const dbPath = process.argv[2] || 'data/algo-trade.db';
  const Database = (await import('better-sqlite3')).default;
  const db = new Database(dbPath);

  // Get unresolved actionable trades from v3
  const trades = db.prepare(
    `SELECT * FROM paper_trades_v3 WHERE resolved = 0 AND direction != 'SKIP' ORDER BY id`
  ).all();

  const alreadyResolved = db.prepare(
    `SELECT COUNT(*) as cnt FROM paper_trades_v3 WHERE resolved = 1`
  ).get();

  console.log(`\n📊 Paper Trades Resolution Check`);
  console.log(`Already resolved: ${alreadyResolved.cnt}`);
  console.log(`Checking ${trades.length} unresolved actionable trades...\n`);

  const updateStmt = db.prepare(
    `UPDATE paper_trades_v3 SET resolved = 1, outcome = ?, correct = ? WHERE id = ?`
  );

  let newResolved = 0, newCorrect = 0, newIncorrect = 0, errors = 0;

  for (const t of trades) {
    // Try slug first (most reliable), then conditionId
    let market = await fetchBySlug(t.slug);
    if (!market) market = await fetchByConditionId(t.condition_id);

    const outcome = getOutcome(market);
    if (!outcome) {
      process.stdout.write(`  ⏳ ${t.market_question.slice(0, 60)}\n`);
      await new Promise(r => setTimeout(r, 200));
      continue;
    }

    const correct = isCorrect(t.direction, outcome);
    const pnl = computePnl(t.direction, t.market_prob, outcome);
    const brier = (t.our_prob - (outcome === 'YES' ? 1 : 0)) ** 2;

    updateStmt.run(outcome, correct ? 1 : 0, t.id);
    newResolved++;
    if (correct) newCorrect++;
    else newIncorrect++;

    const mark = correct ? '✅' : '❌';
    console.log(`  ${mark} ${outcome} | edge:${t.edge.toFixed(3).padStart(7)} | pnl:$${pnl.toFixed(2).padStart(6)} | brier:${brier.toFixed(3)} | ${t.market_question.slice(0, 50)}`);
    await new Promise(r => setTimeout(r, 300));
  }

  // Full summary from DB
  const all = db.prepare(
    `SELECT * FROM paper_trades_v3 WHERE resolved = 1 AND direction != 'SKIP'`
  ).all();

  const totalCorrect = all.filter(t => t.correct === 1).length;
  const totalResolved = all.length;
  const accuracy = totalResolved > 0 ? totalCorrect / totalResolved : 0;

  let totalBrier = 0, totalPnl = 0, totalMktBrier = 0;
  for (const t of all) {
    const actual = t.outcome === 'YES' ? 1 : 0;
    totalBrier += (t.our_prob - actual) ** 2;
    totalMktBrier += (t.market_prob - actual) ** 2;
    totalPnl += computePnl(t.direction, t.market_prob, t.outcome);
  }
  const avgBrier = totalResolved > 0 ? totalBrier / totalResolved : 1;
  const avgMktBrier = totalResolved > 0 ? totalMktBrier / totalResolved : 1;

  // Calibration buckets
  const buckets = [
    { range: '0-20%', min: 0, max: 0.2, pred: 0, act: 0, n: 0 },
    { range: '20-40%', min: 0.2, max: 0.4, pred: 0, act: 0, n: 0 },
    { range: '40-60%', min: 0.4, max: 0.6, pred: 0, act: 0, n: 0 },
    { range: '60-80%', min: 0.6, max: 0.8, pred: 0, act: 0, n: 0 },
    { range: '80-100%', min: 0.8, max: 1.01, pred: 0, act: 0, n: 0 },
  ];
  for (const t of all) {
    const actual = t.outcome === 'YES' ? 1 : 0;
    for (const b of buckets) {
      if (t.our_prob >= b.min && t.our_prob < b.max) {
        b.pred += t.our_prob;
        b.act += actual;
        b.n++;
        break;
      }
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('RESOLUTION SUMMARY — ALL BATCHES');
  console.log('='.repeat(70));
  console.log(`This check:       +${newResolved} resolved (+${newCorrect} correct, +${newIncorrect} incorrect)`);
  console.log(`Total resolved:   ${totalResolved}`);
  console.log(`Correct:          ${totalCorrect}`);
  console.log(`Accuracy:         ${(accuracy * 100).toFixed(1)}%`);
  console.log(`Our Brier:        ${avgBrier.toFixed(4)}`);
  console.log(`Market Brier:     ${avgMktBrier.toFixed(4)} (baseline)`);
  console.log(`Brier edge:       ${(avgMktBrier - avgBrier).toFixed(4)} (positive = we're better)`);
  console.log(`Simulated PnL:    $${totalPnl.toFixed(2)} (on $10/trade)`);

  console.log('\nCalibration:');
  for (const b of buckets) {
    if (b.n === 0) continue;
    const avgPred = (b.pred / b.n * 100).toFixed(0);
    const avgAct = (b.act / b.n * 100).toFixed(0);
    console.log(`  ${b.range.padEnd(8)} | n=${String(b.n).padStart(3)} | pred:${avgPred.padStart(3)}% | actual:${avgAct.padStart(3)}%`);
  }

  // GO / NO-GO decision
  console.log('\n' + '='.repeat(70));
  console.log('PHASE 2 GO/NO-GO ASSESSMENT');
  console.log('='.repeat(70));

  const resolvedCheck = totalResolved >= PHASE2_MIN_RESOLVED;
  const accuracyCheck = accuracy >= PHASE2_MIN_ACCURACY;
  const brierCheck = avgBrier <= PHASE2_MAX_BRIER;

  console.log(`  [${resolvedCheck ? '✅' : '⏳'}] Resolved ≥${PHASE2_MIN_RESOLVED}: ${totalResolved}`);
  console.log(`  [${accuracyCheck ? '✅' : '❌'}] Accuracy ≥${(PHASE2_MIN_ACCURACY*100)}%: ${(accuracy*100).toFixed(1)}%`);
  console.log(`  [${brierCheck ? '✅' : '❌'}] Brier ≤${PHASE2_MAX_BRIER}: ${avgBrier.toFixed(4)}`);

  if (resolvedCheck && accuracyCheck && brierCheck) {
    console.log('\n🟢 GO — Fund wallet $500 and proceed to Phase 2 live trading!');
  } else if (!resolvedCheck) {
    console.log(`\n🟡 WAIT — Need ${PHASE2_MIN_RESOLVED - totalResolved} more resolutions. Run again in a few days.`);
  } else {
    console.log('\n🔴 NO-GO — Edge not validated. Review strategy before funding.');
  }

  console.log('='.repeat(70));
  db.close();
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
