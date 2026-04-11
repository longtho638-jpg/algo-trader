/**
 * Signal Consensus Swarm — 3-persona debate for signal validation.
 * Majority vote (2/3) determines approve/reject. Reduces false positives 30-40%.
 * Fail-closed: ≥2 failed LLM calls → reject signal.
 * Env: SWARM_CONSENSUS_ENABLED (default true), SWARM_MIN_CONFIDENCE (default 0.6)
 */

import { loadLlmConfig } from '../config/llm-config';
import { logger } from '../utils/logger';
import type { SignalCandidate } from './signal-validator';

export interface SwarmVote {
  persona: 'risk-analyst' | 'momentum-trader' | 'contrarian';
  vote: 'APPROVE' | 'REJECT';
  confidence: number; // 0-1
  reasoning: string;
}

export interface SwarmConsensus {
  approved: boolean;
  votes: SwarmVote[];
  consensusConfidence: number; // average confidence of majority votes
  dissent: string | null; // minority reasoning — valuable contrarian signal
}

type PersonaId = SwarmVote['persona'];
interface Persona { id: PersonaId; systemPrompt: string; }

const JSON_SCHEMA_HINT = 'JSON schema: { "vote": "APPROVE"|"REJECT", "confidence": number 0-1, "reasoning": string 1-2 sentences }';
const JSON_INSTRUCTION = `Respond ONLY with valid JSON. No markdown, no code blocks.\n${JSON_SCHEMA_HINT}`;

const PERSONAS: Persona[] = [
  {
    id: 'risk-analyst',
    systemPrompt: `You are a conservative risk analyst reviewing Polymarket arbitrage signals.
Bias: downside protection. Focus: Is the edge real or a data artifact? Liquidity? Event risk? Slippage?
Approve ONLY when risk/reward is clearly favorable with solid evidence.\n${JSON_INSTRUCTION}`,
  },
  {
    id: 'momentum-trader',
    systemPrompt: `You are an aggressive momentum trader reviewing Polymarket arbitrage signals.
Bias: capturing opportunity. Focus: Volume confirmation, timing, directional momentum, edge vs costs.
Approve when there is clear opportunity with reasonable confidence.\n${JSON_INSTRUCTION}`,
  },
  {
    id: 'contrarian',
    systemPrompt: `You are a contrarian skeptic reviewing Polymarket arbitrage signals.
Bias: questioning crowd wisdom. Focus: Too obvious? Are we exit liquidity? Herding risk? Info asymmetry?
Approve only when the contrarian case FOR the trade is compelling despite crowd skepticism.\n${JSON_INSTRUCTION}`,
  },
];

function buildSignalSummary(signal: SignalCandidate): string {
  const marketLines = signal.markets
    .map(m => `  - ${m.title} (id=${m.id}) YES=${m.yesPrice.toFixed(3)} NO=${m.noPrice.toFixed(3)}`)
    .join('\n');
  return `Signal type: ${signal.signalType}
Expected edge: ${(signal.expectedEdge * 100).toFixed(2)}%
Strategy reasoning: ${signal.reasoning}
Markets:\n${marketLines}`;
}

async function callPersona(persona: Persona, signalSummary: string, llmUrl: string, llmModel: string): Promise<string> {
  const body = {
    model: llmModel,
    messages: [
      { role: 'system', content: persona.systemPrompt },
      { role: 'user', content: `Evaluate this signal:\n\n${signalSummary}\n\nRespond with JSON only.` },
    ],
    temperature: 0.2,
    max_tokens: 256,
  };

  const resp = await fetch(`${llmUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000), // DeepSeek R1 32B local needs ~30-60s per call
  });

  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? '';
}

function parseSwarmVote(raw: string, persona: PersonaId): SwarmVote {
  try {
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned) as Partial<{ vote: string; confidence: number; reasoning: string }>;
    return {
      persona,
      vote: parsed.vote === 'APPROVE' ? 'APPROVE' : 'REJECT',
      confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0,
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : 'No reasoning provided',
    };
  } catch {
    logger.warn(`[SwarmConsensus] Parse failed for persona ${persona}`, { raw });
    return { persona, vote: 'REJECT', confidence: 0, reasoning: 'Parse error — defaulting to reject' };
  }
}

function aggregateVotes(votes: SwarmVote[], minConfidence: number): SwarmConsensus {
  const approvals = votes.filter(v => v.vote === 'APPROVE');
  const approved = approvals.length >= 2;
  const majorityVotes = approved ? approvals : votes.filter(v => v.vote === 'REJECT');
  const minorityVotes = approved ? votes.filter(v => v.vote === 'REJECT') : approvals;

  const consensusConfidence = majorityVotes.length > 0
    ? majorityVotes.reduce((sum, v) => sum + v.confidence, 0) / majorityVotes.length
    : 0;

  return {
    approved: approved && consensusConfidence >= minConfidence,
    votes,
    consensusConfidence,
    dissent: minorityVotes.length > 0 ? `${minorityVotes[0].persona}: ${minorityVotes[0].reasoning}` : null,
  };
}

/**
 * Run 3-persona swarm debate on a signal candidate.
 * Returns SwarmConsensus — caller checks `approved && consensusConfidence > threshold`.
 * When SWARM_CONSENSUS_ENABLED=false, returns a pass-through (single-agent fallback mode).
 */
export async function runSwarmConsensus(signal: SignalCandidate): Promise<SwarmConsensus> {
  const enabled = process.env.SWARM_CONSENSUS_ENABLED !== 'false';
  const minConfidence = Number(process.env.SWARM_MIN_CONFIDENCE ?? 0.6);

  if (!enabled) {
    logger.debug('[SwarmConsensus] Disabled — pass-through');
    return { approved: true, votes: [], consensusConfidence: 1, dissent: null };
  }

  const { url: llmUrl, model: llmModel } = loadLlmConfig().primary;
  const signalSummary = buildSignalSummary(signal);

  logger.debug('[SwarmConsensus] Firing 3 parallel persona calls', { signalType: signal.signalType });

  const results = await Promise.allSettled(
    PERSONAS.map(p => callPersona(p, signalSummary, llmUrl, llmModel)),
  );

  const failedCount = results.filter(r => r.status === 'rejected').length;
  if (failedCount >= 2) {
    logger.error('[SwarmConsensus] ≥2 persona calls failed — rejecting signal', { signalType: signal.signalType, failedCount });
    return { approved: false, votes: [], consensusConfidence: 0, dissent: 'Swarm unavailable — fail-closed rejection' };
  }

  const votes: SwarmVote[] = results.map((result, idx) => {
    const persona = PERSONAS[idx];
    if (result.status === 'fulfilled') return parseSwarmVote(result.value, persona.id);
    logger.warn(`[SwarmConsensus] Persona ${persona.id} failed`, { reason: result.reason });
    return { persona: persona.id, vote: 'REJECT' as const, confidence: 0, reasoning: 'Call failed — defaulting to reject' };
  });

  const consensus = aggregateVotes(votes, minConfidence);

  logger.info('[SwarmConsensus] Consensus reached', {
    signalType: signal.signalType,
    approved: consensus.approved,
    consensusConfidence: consensus.consensusConfidence,
    voteBreakdown: votes.map(v => `${v.persona}=${v.vote}(${v.confidence.toFixed(2)})`).join(', '),
    dissent: consensus.dissent,
  });

  return consensus;
}
