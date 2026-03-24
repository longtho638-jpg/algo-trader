#!/usr/bin/env node
// A/B Test: Single DeepSeek R1 vs Ensemble (N=3) on prediction markets
// Runs same 10 markets through single estimate and 3-run ensemble, compares
// Usage: node scripts/ab-test-models.mjs [llm-port]

const LLM_PORT = process.argv[2] || '11435';
const LLM_URL = `http://localhost:${LLM_PORT}/v1/chat/completions`;
const GAMMA_API = 'https://gamma-api.polymarket.com/markets';
const MODEL = 'mlx-community/DeepSeek-R1-Distill-Qwen-32B-4bit';

const SYSTEM_PROMPT = [
  'You are a superforecaster trained in calibrated probability estimation.',
  'Use reference class forecasting: start with base rates for similar events, then adjust for specifics.',
  'Avoid anchoring, overconfidence, and narrative bias.',
  'Do NOT ask for or assume any market price. Give your independent estimate.',
  'Respond ONLY with valid JSON — no markdown, no extra text.',
].join(' ');

function buildPrompt(question) {
  return [
    `Prediction market question: "${question}"`,
    '',
    'Estimate using this framework:',
    '1. BASE RATE: Out of 100 similar events in history, how many happened? (frequency format)',
    '2. INSIDE VIEW: What specific factors make THIS case different from the reference class?',
    '3. DE-BIAS: Are you anchored? Overconfident? Neglecting base rates? Adjust toward base rate.',
    '4. FINAL: Combine outside + inside views. State probability.',
    '',
    'Do NOT guess what the market thinks. Give YOUR independent estimate.',
    '',
    'Respond with ONLY this JSON:',
    '{"probability":0.0-1.0,"confidence":0.0-1.0,"reasoning":"base rate X/100, adjusted because..."}',
  ].join('\n');
}

async function estimate(question, temperature = 0.3) {
  const start = Date.now();
  const res = await fetch(LLM_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildPrompt(question) },
      ],
      max_tokens: 2000,
      temperature,
    }),
    signal: AbortSignal.timeout(120000),
  });

  const latency = Date.now() - start;
  if (!res.ok) return { error: `HTTP ${res.status}`, latency };

  const data = await res.json();
  const msg = data.choices?.[0]?.message || {};
  const raw = (msg.content || '') + (msg.reasoning || '');

  try {
    const cleaned = raw.replace(/```(?:json)?\n?/g, '').replace(/<think>[\s\S]*?<\/think>/g, '');
    const match = cleaned.match(/\{[\s\S]*?\}/g)?.find(m => m.includes('probability'));
    if (!match) return { error: 'No JSON', latency };
    const parsed = JSON.parse(match);
    return {
      probability: Math.max(0.01, Math.min(0.99, parsed.probability ?? 0.5)),
      confidence: parsed.confidence ?? 0.5,
      reasoning: (parsed.reasoning || '').slice(0, 120),
      latency,
    };
  } catch {
    return { error: 'Parse fail', latency };
  }
}

async function ensembleEstimate(question) {
  const temps = [0.2, 0.4, 0.6];
  const results = [];
  const start = Date.now();

  for (const t of temps) {
    const r = await estimate(question, t);
    if (!r.error) results.push(r);
  }

  if (results.length === 0) return { error: 'All runs failed', latency: Date.now() - start };

  const probs = results.map(r => r.probability).sort((a, b) => a - b);
  const median = probs[Math.floor(probs.length / 2)];
  const maxDev = Math.max(...probs.map(p => Math.abs(p - median)));
  const agreement = 1 - Math.min(maxDev / 0.5, 1);
  const avgConf = results.reduce((s, r) => s + r.confidence, 0) / results.length;

  return {
    probability: median,
    confidence: agreement > 0.85 ? Math.min(avgConf * 1.1, 1) : avgConf * agreement,
    reasoning: `ensemble n=${results.length} agree=${agreement.toFixed(2)} spread=[${probs.map(p=>p.toFixed(3)).join(',')}]`,
    latency: Date.now() - start,
    agreement,
    spread: probs,
  };
}

async function fetchTestMarkets(count = 10) {
  const res = await fetch(`${GAMMA_API}?active=true&closed=false&limit=200`);
  const markets = await res.json();

  const pricePattern = /\b(above|below|close above|dip to|price of|O\/U|Points|Kills|spread|handicap)\b/i;
  const excludeCats = new Set(['crypto', 'cryptocurrency', 'esports']);

  return markets.filter(m => {
    if (!m.active || m.closed) return false;
    let outcomes;
    try { outcomes = typeof m.outcomes === 'string' ? JSON.parse(m.outcomes) : m.outcomes; } catch { return false; }
    if (!Array.isArray(outcomes) || outcomes.length !== 2 || outcomes[0] !== 'Yes') return false;
    if (pricePattern.test(m.question || '')) return false;
    if (excludeCats.has((m.category || '').toLowerCase())) return false;
    let prices;
    try { prices = typeof m.outcomePrices === 'string' ? JSON.parse(m.outcomePrices) : m.outcomePrices; } catch { return false; }
    const yp = parseFloat(prices[0]);
    if (isNaN(yp) || yp <= 0.05 || yp >= 0.95) return false;
    m._yesPrice = yp;
    return true;
  }).slice(0, count);
}

async function main() {
  console.log('A/B Test: Single vs Ensemble (N=3) — DeepSeek R1\n');
  console.log('Fetching 10 event markets...\n');
  const markets = await fetchTestMarkets(10);
  console.log(`Got ${markets.length} markets\n`);

  const singleResults = [];
  const ensembleResults = [];

  for (const m of markets) {
    const q = m.question;
    const mktPrice = m._yesPrice;
    console.log(`--- ${q.slice(0, 65)} (mkt: ${mktPrice.toFixed(3)}) ---`);

    // Single estimate
    console.log('  Single: estimating...');
    const single = await estimate(q);
    if (single.error) {
      console.log(`  Single: ERROR ${single.error} (${single.latency}ms)`);
    } else {
      const edge = single.probability - mktPrice;
      console.log(`  Single: prob=${single.probability.toFixed(3)} edge=${edge.toFixed(3)} conf=${single.confidence.toFixed(2)} (${single.latency}ms)`);
      singleResults.push({ q, mktPrice, ...single, edge });
    }

    // Ensemble estimate
    console.log('  Ensemble: estimating (3 runs)...');
    const ens = await ensembleEstimate(q);
    if (ens.error) {
      console.log(`  Ensemble: ERROR ${ens.error} (${ens.latency}ms)`);
    } else {
      const edge = ens.probability - mktPrice;
      console.log(`  Ensemble: prob=${ens.probability.toFixed(3)} edge=${edge.toFixed(3)} agree=${ens.agreement.toFixed(2)} (${ens.latency}ms)`);
      ensembleResults.push({ q, mktPrice, ...ens, edge });
    }
    console.log('');
  }

  // Summary
  console.log('='.repeat(70));
  console.log('A/B TEST SUMMARY: Single vs Ensemble');
  console.log('='.repeat(70));

  for (const [label, results] of [['Single', singleResults], ['Ensemble', ensembleResults]]) {
    const avgEdge = results.reduce((s, r) => s + Math.abs(r.edge), 0) / (results.length || 1);
    const avgLatency = results.reduce((s, r) => s + r.latency, 0) / (results.length || 1);
    const avgConf = results.reduce((s, r) => s + r.confidence, 0) / (results.length || 1);
    const actionable = results.filter(r => Math.abs(r.edge) > 0.05).length;

    console.log(`\n${label}:`);
    console.log(`  Successful: ${results.length}`);
    console.log(`  Avg |edge|: ${(avgEdge * 100).toFixed(1)}%`);
    console.log(`  Avg confidence: ${avgConf.toFixed(2)}`);
    console.log(`  Avg latency: ${(avgLatency / 1000).toFixed(1)}s`);
    console.log(`  Actionable (>5% edge): ${actionable}`);
  }

  // Variance comparison
  console.log('\nVariance Comparison:');
  const paired = [];
  for (const s of singleResults) {
    const e = ensembleResults.find(r => r.q === s.q);
    if (e) paired.push({ single: s.probability, ensemble: e.probability, mkt: s.mktPrice });
  }
  if (paired.length > 0) {
    const singleVar = variance(paired.map(p => p.single - p.mkt));
    const ensembleVar = variance(paired.map(p => p.ensemble - p.mkt));
    const reduction = ((1 - ensembleVar / singleVar) * 100).toFixed(1);
    console.log(`  Single edge variance: ${singleVar.toFixed(4)}`);
    console.log(`  Ensemble edge variance: ${ensembleVar.toFixed(4)}`);
    console.log(`  Variance reduction: ${reduction}%`);
  }

  console.log('\n' + '='.repeat(70));
}

function variance(arr) {
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  return arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
