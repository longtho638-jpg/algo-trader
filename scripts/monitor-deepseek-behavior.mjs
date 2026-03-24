#!/usr/bin/env node
// Monitor DeepSeek R1 behavior on prediction markets
// Tracks: accuracy, calibration, edge distribution, Brier score, PnL simulation
// Usage: node scripts/monitor-deepseek-behavior.mjs [db-path] [--json]
// Follows BINH_PHAP_TRADING.MD KPIs and circuit breakers

const DB_PATH = process.argv[2] || 'data/algo-trade.db';
const JSON_OUTPUT = process.argv.includes('--json');

async function main() {
  const Database = (await import('better-sqlite3')).default;
  let db;
  try {
    db = new Database(DB_PATH, { readonly: true });
  } catch (err) {
    console.error(`Cannot open DB: ${DB_PATH} — ${err.message}`);
    process.exit(1);
  }

  // Check which tables exist
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
  const hasV3 = tables.includes('paper_trades_v3');
  const hasV1 = tables.includes('paper_trades');
  const hasAiDecisions = tables.includes('ai_decisions');

  if (!hasV3 && !hasV1) {
    console.error('No paper_trades tables found. Run paper-trade-event-only.mjs first.');
    db.close();
    process.exit(1);
  }

  const tableName = hasV3 ? 'paper_trades_v3' : 'paper_trades';
  const directionCol = hasV3 ? 'direction' : 'direction';
  const resolvedCol = 'resolved';
  const outcomeCol = hasV3 ? 'outcome' : 'actual_outcome';

  // --- Gather all data ---
  const allTrades = db.prepare(`SELECT * FROM ${tableName} ORDER BY id`).all();
  const actionable = allTrades.filter(t => t[directionCol] !== 'SKIP');
  const resolved = allTrades.filter(t => t[resolvedCol] === 1);
  const resolvedActionable = resolved.filter(t => t[directionCol] !== 'SKIP');

  // --- KPI 1: Basic Stats ---
  const totalTrades = allTrades.length;
  const actionableCount = actionable.length;
  const actionableRate = totalTrades > 0 ? (actionableCount / totalTrades * 100) : 0;
  const resolvedCount = resolvedActionable.length;

  // --- KPI 2: Accuracy ---
  let correctCount = 0;
  for (const t of resolvedActionable) {
    const outcome = hasV3 ? t.outcome : (t.actual_outcome >= 0.5 ? 'YES' : 'NO');
    const dir = (t[directionCol] || '').toUpperCase();
    const isCorrect = (dir.includes('YES') && outcome === 'YES') || (dir.includes('NO') && outcome === 'NO');
    if (isCorrect) correctCount++;
  }
  const accuracy = resolvedCount > 0 ? (correctCount / resolvedCount * 100) : null;

  // --- KPI 3: Brier Score ---
  let totalBrier = 0, totalMktBrier = 0;
  for (const t of resolvedActionable) {
    const outcome = hasV3 ? t.outcome : (t.actual_outcome >= 0.5 ? 'YES' : 'NO');
    const actual = outcome === 'YES' ? 1 : 0;
    totalBrier += (t.our_prob - actual) ** 2;
    totalMktBrier += (t.market_prob - actual) ** 2;
  }
  const avgBrier = resolvedCount > 0 ? totalBrier / resolvedCount : null;
  const avgMktBrier = resolvedCount > 0 ? totalMktBrier / resolvedCount : null;
  const brierEdge = avgBrier !== null && avgMktBrier !== null ? avgMktBrier - avgBrier : null;

  // --- KPI 4: Edge Distribution ---
  const edges = actionable.map(t => Math.abs(t.edge));
  const avgEdge = edges.length > 0 ? edges.reduce((a, b) => a + b, 0) / edges.length : 0;
  const minEdge = edges.length > 0 ? Math.min(...edges) : 0;
  const maxEdge = edges.length > 0 ? Math.max(...edges) : 0;

  // Edge buckets
  const edgeBuckets = [
    { range: '5-10%', min: 0.05, max: 0.10, count: 0 },
    { range: '10-15%', min: 0.10, max: 0.15, count: 0 },
    { range: '15-20%', min: 0.15, max: 0.20, count: 0 },
    { range: '20%+', min: 0.20, max: 1.0, count: 0 },
  ];
  for (const e of edges) {
    for (const b of edgeBuckets) {
      if (e >= b.min && e < b.max) { b.count++; break; }
    }
  }

  // --- KPI 5: Calibration ---
  const calBuckets = [
    { range: '0-20%', min: 0, max: 0.2, predSum: 0, actSum: 0, n: 0 },
    { range: '20-40%', min: 0.2, max: 0.4, predSum: 0, actSum: 0, n: 0 },
    { range: '40-60%', min: 0.4, max: 0.6, predSum: 0, actSum: 0, n: 0 },
    { range: '60-80%', min: 0.6, max: 0.8, predSum: 0, actSum: 0, n: 0 },
    { range: '80-100%', min: 0.8, max: 1.01, predSum: 0, actSum: 0, n: 0 },
  ];
  for (const t of resolvedActionable) {
    const outcome = hasV3 ? t.outcome : (t.actual_outcome >= 0.5 ? 'YES' : 'NO');
    const actual = outcome === 'YES' ? 1 : 0;
    for (const b of calBuckets) {
      if (t.our_prob >= b.min && t.our_prob < b.max) {
        b.predSum += t.our_prob;
        b.actSum += actual;
        b.n++;
        break;
      }
    }
  }

  // --- KPI 6: Simulated PnL ---
  let totalPnl = 0;
  const BET_SIZE = 10;
  for (const t of resolvedActionable) {
    const outcome = hasV3 ? t.outcome : (t.actual_outcome >= 0.5 ? 'YES' : 'NO');
    const dir = (t[directionCol] || '').toUpperCase();
    if (dir.includes('YES')) {
      totalPnl += (outcome === 'YES' ? BET_SIZE : 0) - (BET_SIZE * t.market_prob);
    } else if (dir.includes('NO')) {
      totalPnl += (outcome === 'NO' ? BET_SIZE : 0) - (BET_SIZE * (1 - t.market_prob));
    }
  }

  // --- KPI 7: Direction Breakdown ---
  const buyYes = actionable.filter(t => t[directionCol].toUpperCase().includes('YES')).length;
  const buyNo = actionable.filter(t => t[directionCol].toUpperCase().includes('NO')).length;

  // --- KPI 8: Confidence Stats ---
  const confidences = actionable.map(t => t.confidence).filter(c => c != null);
  const avgConf = confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : null;

  // --- KPI 9: Parse Error Rate ---
  const parseErrors = allTrades.filter(t =>
    (t.reasoning || '').toLowerCase().includes('parse error')
  ).length;
  const parseErrorRate = totalTrades > 0 ? (parseErrors / totalTrades * 100) : 0;

  // --- KPI 10: Consecutive Losses ---
  let maxConsecLosses = 0, currentStreak = 0;
  for (const t of resolvedActionable) {
    const outcome = hasV3 ? t.outcome : (t.actual_outcome >= 0.5 ? 'YES' : 'NO');
    const dir = (t[directionCol] || '').toUpperCase();
    const isCorrect = (dir.includes('YES') && outcome === 'YES') || (dir.includes('NO') && outcome === 'NO');
    if (!isCorrect) {
      currentStreak++;
      maxConsecLosses = Math.max(maxConsecLosses, currentStreak);
    } else {
      currentStreak = 0;
    }
  }

  // --- Circuit Breaker Checks (BINH_PHAP_TRADING.MD Section 4.3) ---
  const circuitBreakers = [];
  if (resolvedCount >= 50 && accuracy !== null && accuracy < 50) {
    circuitBreakers.push('PAUSE: accuracy < 50% over 50+ trades');
  }
  if (avgBrier !== null && avgBrier > 0.30) {
    circuitBreakers.push('REDUCE: Brier > 0.30 — halve position sizes');
  }
  if (maxConsecLosses >= 5) {
    circuitBreakers.push('PAUSE: 5+ consecutive losses');
  }
  if (parseErrorRate > 20) {
    circuitBreakers.push('HALT: parse error rate > 20%');
  }

  // --- GO/NO-GO (BINH_PHAP_TRADING.MD Section 6) ---
  const goChecks = {
    resolvedMin30: resolvedCount >= 30,
    accuracyMin55: accuracy !== null && accuracy >= 55,
    brierMax025: avgBrier !== null && avgBrier <= 0.25,
    positivePnl: totalPnl > 0,
    parseErrorLow: parseErrorRate < 10,
  };
  const allGo = Object.values(goChecks).every(Boolean);

  // --- AI Decisions Stats ---
  let aiDecisionStats = null;
  if (hasAiDecisions) {
    const total = db.prepare('SELECT COUNT(*) as c FROM ai_decisions').get();
    const applied = db.prepare('SELECT COUNT(*) as c FROM ai_decisions WHERE applied = 1').get();
    const avgLatency = db.prepare('SELECT AVG(latency_ms) as avg FROM ai_decisions').get();
    const models = db.prepare('SELECT model, COUNT(*) as c FROM ai_decisions GROUP BY model').all();
    aiDecisionStats = {
      total: total.c,
      applied: applied.c,
      avgLatencyMs: avgLatency.avg ? Math.round(avgLatency.avg) : 0,
      models,
    };
  }

  db.close();

  // --- Output ---
  const report = {
    timestamp: new Date().toISOString(),
    table: tableName,
    overview: {
      totalTrades,
      actionable: actionableCount,
      actionableRate: `${actionableRate.toFixed(1)}%`,
      resolved: resolvedCount,
      correct: correctCount,
      buyYes,
      buyNo,
    },
    accuracy: {
      directional: accuracy !== null ? `${accuracy.toFixed(1)}%` : 'pending',
      target: '>=55%',
      status: accuracy === null ? 'WAIT' : accuracy >= 55 ? 'OK' : 'FAIL',
    },
    brier: {
      ours: avgBrier !== null ? avgBrier.toFixed(4) : 'pending',
      market: avgMktBrier !== null ? avgMktBrier.toFixed(4) : 'pending',
      edge: brierEdge !== null ? brierEdge.toFixed(4) : 'pending',
      target: '<=0.25',
      status: avgBrier === null ? 'WAIT' : avgBrier <= 0.25 ? 'OK' : 'FAIL',
    },
    edge: {
      avg: `${(avgEdge * 100).toFixed(1)}%`,
      min: `${(minEdge * 100).toFixed(1)}%`,
      max: `${(maxEdge * 100).toFixed(1)}%`,
      target: '>=8%',
      distribution: edgeBuckets.map(b => `${b.range}: ${b.count}`),
    },
    calibration: calBuckets.filter(b => b.n > 0).map(b => ({
      range: b.range,
      n: b.n,
      avgPredicted: `${(b.predSum / b.n * 100).toFixed(0)}%`,
      avgActual: `${(b.actSum / b.n * 100).toFixed(0)}%`,
      gap: `${(Math.abs(b.predSum / b.n - b.actSum / b.n) * 100).toFixed(1)}%`,
    })),
    confidence: {
      avg: avgConf !== null ? avgConf.toFixed(2) : 'N/A',
    },
    pnl: {
      simulated: `$${totalPnl.toFixed(2)}`,
      betSize: `$${BET_SIZE}/trade`,
      status: totalPnl > 0 ? 'PROFIT' : totalPnl < 0 ? 'LOSS' : 'BREAK_EVEN',
    },
    health: {
      parseErrorRate: `${parseErrorRate.toFixed(1)}%`,
      maxConsecutiveLosses: maxConsecLosses,
    },
    circuitBreakers: circuitBreakers.length > 0 ? circuitBreakers : ['NONE — all clear'],
    goNoGo: {
      checks: goChecks,
      verdict: allGo ? 'GO — proceed to live trading' :
        resolvedCount < 30 ? `WAIT — need ${30 - resolvedCount} more resolutions` :
        'NO-GO — review strategy per BINH_PHAP_TRADING.MD',
    },
    aiDecisions: aiDecisionStats,
  };

  if (JSON_OUTPUT) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  // Pretty print
  console.log('\n' + '='.repeat(70));
  console.log('  DEEPSEEK R1 BEHAVIOR MONITOR — BINH PHAP TRADING');
  console.log('  ' + report.timestamp);
  console.log('='.repeat(70));

  console.log('\n--- OVERVIEW ---');
  console.log(`  Total trades:    ${totalTrades}`);
  console.log(`  Actionable:      ${actionableCount} (${actionableRate.toFixed(1)}%)`);
  console.log(`  BUY_YES / BUY_NO: ${buyYes} / ${buyNo}`);
  console.log(`  Resolved:        ${resolvedCount}`);
  console.log(`  Correct:         ${correctCount}`);

  console.log('\n--- ACCURACY ---');
  console.log(`  Directional:     ${report.accuracy.directional} [target: ${report.accuracy.target}] ${report.accuracy.status}`);

  console.log('\n--- BRIER SCORE ---');
  console.log(`  Ours:            ${report.brier.ours} [target: ${report.brier.target}] ${report.brier.status}`);
  console.log(`  Market baseline: ${report.brier.market}`);
  console.log(`  Edge (mkt-ours): ${report.brier.edge} (positive = we're better)`);

  console.log('\n--- EDGE DISTRIBUTION ---');
  console.log(`  Avg |edge|:      ${report.edge.avg} [target: ${report.edge.target}]`);
  console.log(`  Range:           ${report.edge.min} — ${report.edge.max}`);
  for (const b of edgeBuckets) {
    const bar = '#'.repeat(Math.min(b.count, 40));
    console.log(`  ${b.range.padEnd(8)} | ${String(b.count).padStart(3)} ${bar}`);
  }

  if (report.calibration.length > 0) {
    console.log('\n--- CALIBRATION ---');
    for (const c of report.calibration) {
      console.log(`  ${c.range.padEnd(8)} | n=${String(c.n).padStart(3)} | pred:${c.avgPredicted.padStart(4)} | actual:${c.avgActual.padStart(4)} | gap:${c.gap}`);
    }
  }

  console.log('\n--- PnL SIMULATION ---');
  console.log(`  Simulated PnL:   ${report.pnl.simulated} (${report.pnl.betSize}) ${report.pnl.status}`);

  console.log('\n--- HEALTH ---');
  console.log(`  Parse errors:    ${report.health.parseErrorRate}`);
  console.log(`  Max consec loss: ${report.health.maxConsecutiveLosses}`);
  console.log(`  Confidence avg:  ${report.confidence.avg}`);

  if (aiDecisionStats) {
    console.log('\n--- AI DECISIONS ---');
    console.log(`  Total decisions: ${aiDecisionStats.total}`);
    console.log(`  Applied:         ${aiDecisionStats.applied}`);
    console.log(`  Avg latency:     ${aiDecisionStats.avgLatencyMs}ms`);
    for (const m of aiDecisionStats.models) {
      console.log(`  Model: ${m.model} (${m.c} calls)`);
    }
  }

  console.log('\n--- CIRCUIT BREAKERS ---');
  for (const cb of report.circuitBreakers) {
    console.log(`  ${cb}`);
  }

  console.log('\n--- GO/NO-GO ASSESSMENT ---');
  console.log(`  [${goChecks.resolvedMin30 ? 'OK' : '..'}] Resolved >= 30:  ${resolvedCount}`);
  console.log(`  [${goChecks.accuracyMin55 ? 'OK' : '..'}] Accuracy >= 55%: ${report.accuracy.directional}`);
  console.log(`  [${goChecks.brierMax025 ? 'OK' : '..'}] Brier <= 0.25:    ${report.brier.ours}`);
  console.log(`  [${goChecks.positivePnl ? 'OK' : '..'}] Positive PnL:     ${report.pnl.simulated}`);
  console.log(`  [${goChecks.parseErrorLow ? 'OK' : '..'}] Parse err < 10%:  ${report.health.parseErrorRate}`);
  console.log(`\n  VERDICT: ${report.goNoGo.verdict}`);
  console.log('='.repeat(70) + '\n');
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
