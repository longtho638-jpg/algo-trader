#!/usr/bin/env node
// Check resolution status of paper trades against Polymarket Gamma API
// Usage: node scripts/check-resolutions.mjs [db-path]

const GAMMA_API = 'https://gamma-api.polymarket.com/markets';

async function searchGamma(query) {
  const url = `${GAMMA_API}?_q=${encodeURIComponent(query)}&limit=5`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) return [];
  return res.json();
}

function extractTerms(q) {
  return q.replace(/^Will\s+/i, '').replace(/\?$/, '')
    .replace(/\b(the|a|an|in|on|at|by|for|of|to|be|is|are|was|were)\b/gi, '')
    .replace(/\s+/g, ' ').trim().slice(0, 80);
}

function findMatch(question, markets) {
  const qWords = new Set(question.toLowerCase().split(/\s+/));
  let best = null, bestScore = 0;
  for (const m of markets) {
    const mWords = (m.question || '').toLowerCase().split(/\s+/);
    const overlap = mWords.filter(w => qWords.has(w)).length / Math.max(qWords.size, 1);
    if (overlap > bestScore) { bestScore = overlap; best = m; }
  }
  return bestScore >= 0.35 ? { market: best, score: bestScore } : null;
}

function getOutcome(m) {
  if (m.outcome === 'Yes' || m.outcome === 'YES') return 'YES';
  if (m.outcome === 'No' || m.outcome === 'NO') return 'NO';
  if (m.outcomePrices) {
    try {
      const p = JSON.parse(m.outcomePrices);
      if (p[0] === 1) return 'YES';
      if (p[1] === 1) return 'NO';
    } catch {}
  }
  return null;
}

async function main() {
  const dbPath = process.argv[2] || 'data/algo-trade.db';
  const Database = (await import('better-sqlite3')).default;
  const db = new Database(dbPath);

  const trades = db.prepare('SELECT * FROM paper_trades_v2 ORDER BY abs(edge) DESC').all();
  console.log(`\nChecking ${trades.length} paper trades against Polymarket...\n`);

  let resolved = 0, correct = 0, incorrect = 0, unresolved = 0;
  let totalBrier = 0, totalPnl = 0;

  for (const t of trades) {
    const terms = extractTerms(t.market_question);
    const markets = await searchGamma(terms);
    const match = findMatch(t.market_question, markets);

    if (!match || !match.market.resolved) {
      unresolved++;
      console.log(`  ? UNRESOLVED | ${t.market_question.slice(0, 60)}`);
      await new Promise(r => setTimeout(r, 300));
      continue;
    }

    const outcome = getOutcome(match.market);
    if (!outcome) {
      unresolved++;
      console.log(`  ? NO_OUTCOME | ${t.market_question.slice(0, 60)}`);
      await new Promise(r => setTimeout(r, 300));
      continue;
    }

    resolved++;
    const dir = t.direction.toUpperCase();
    const isCorrect = (dir.includes('YES') && outcome === 'YES') ||
                      (dir.includes('NO') && outcome === 'NO');

    if (isCorrect) correct++;
    else incorrect++;

    // Brier score
    const actual = outcome === 'YES' ? 1 : 0;
    const brier = (t.our_prob - actual) ** 2;
    totalBrier += brier;

    // Simulated $10 PnL
    let pnl = 0;
    if (dir.includes('YES')) {
      pnl = (outcome === 'YES' ? 10 : 0) - (10 * t.market_prob);
    } else if (dir.includes('NO')) {
      pnl = (outcome === 'NO' ? 10 : 0) - (10 * (1 - t.market_prob));
    }
    totalPnl += pnl;

    const mark = isCorrect ? '✓' : '✗';
    console.log(`  ${mark} ${outcome.padEnd(3)} | edge:${t.edge.toFixed(3).padStart(7)} | pnl:$${pnl.toFixed(2).padStart(6)} | ${t.market_question.slice(0, 55)}`);
    await new Promise(r => setTimeout(r, 300));
  }

  console.log('\n' + '='.repeat(70));
  console.log('RESOLUTION SUMMARY');
  console.log('='.repeat(70));
  console.log(`Total trades:     ${trades.length}`);
  console.log(`Resolved:         ${resolved}`);
  console.log(`Unresolved:       ${unresolved}`);
  console.log(`Correct:          ${correct}`);
  console.log(`Incorrect:        ${incorrect}`);
  console.log(`Accuracy:         ${resolved > 0 ? (correct/resolved*100).toFixed(1) : 'N/A'}%`);
  console.log(`Avg Brier Score:  ${resolved > 0 ? (totalBrier/resolved).toFixed(4) : 'N/A'}`);
  console.log(`Simulated PnL:    $${totalPnl.toFixed(2)} (on $10/trade)`);
  console.log(`Market Brier:     ${resolved > 0 ? (trades.filter((_,i)=>i<resolved).reduce((s,t)=>{const a=getOutcome(findMatch(t.market_question,[])?.market||{});return s},0)) : 'N/A'} (baseline)`);
  console.log('='.repeat(70));

  db.close();
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
