/**
 * Vibe Controller — NATS-based runtime mode switcher
 *
 * Subscribes to `vibe.command` for natural language trading directives.
 * Publishes updated state to `vibe.state.updated`.
 * State persisted to Redis key `vibe:state`; falls back to balanced defaults.
 */

import { createMessageBus } from '../messaging/create-message-bus';
import { getRedisClient } from '../redis/index';
import { logger } from '../utils/logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TradingMode = 'conservative' | 'balanced' | 'aggressive' | 'defensive';

export interface VibeState {
  mode: TradingMode;
  minEdge: number;
  maxExposure: number;
  marketFilter: string | null;
  liquidityFloor: number;
  pausedMarkets: string[];
  updatedAt: number;
  updatedBy: string;
}

export interface VibeCommand {
  action: 'set-mode' | 'filter-markets' | 'pause-market' | 'resume-market' | 'set-param';
  payload: Record<string, unknown>;
  source: string;
}

// ─── Topics ───────────────────────────────────────────────────────────────────

export const VIBE_TOPICS = {
  COMMAND: 'vibe.command',
  STATE_UPDATED: 'vibe.state.updated',
} as const;

const REDIS_KEY = 'vibe:state';

// ─── Mode presets ─────────────────────────────────────────────────────────────

const MODE_PRESETS: Record<TradingMode, Pick<VibeState, 'minEdge' | 'maxExposure' | 'liquidityFloor'>> = {
  conservative: { minEdge: 3.0, maxExposure: 10, liquidityFloor: 50_000 },
  balanced:     { minEdge: 2.5, maxExposure: 15, liquidityFloor: 10_000 },
  aggressive:   { minEdge: 1.5, maxExposure: 25, liquidityFloor: 5_000  },
  defensive:    { minEdge: 5.0, maxExposure: 5,  liquidityFloor: 100_000 },
};

const BALANCED_DEFAULTS: VibeState = {
  mode: 'balanced',
  ...MODE_PRESETS.balanced,
  marketFilter: null,
  pausedMarkets: [],
  updatedAt: Date.now(),
  updatedBy: 'system:init',
};

// ─── Module-level state ───────────────────────────────────────────────────────

let currentState: VibeState = { ...BALANCED_DEFAULTS };

// ─── Redis persistence ────────────────────────────────────────────────────────

async function loadStateFromRedis(): Promise<void> {
  try {
    const raw = await getRedisClient().get(REDIS_KEY);
    if (raw) {
      currentState = JSON.parse(raw) as VibeState;
      logger.info('[VibeController] Loaded state from Redis', { mode: currentState.mode });
    } else {
      logger.info('[VibeController] No saved state; using balanced defaults');
    }
  } catch (err) {
    logger.warn('[VibeController] Redis unavailable; using balanced defaults', { err });
  }
}

async function persistState(state: VibeState): Promise<void> {
  try {
    await getRedisClient().set(REDIS_KEY, JSON.stringify(state));
  } catch (err) {
    logger.warn('[VibeController] Failed to persist state to Redis', { err });
  }
}

// ─── Command processing ───────────────────────────────────────────────────────

function applyCommand(cmd: VibeCommand): VibeState {
  const next: VibeState = { ...currentState, updatedAt: Date.now(), updatedBy: cmd.source };

  switch (cmd.action) {
    case 'set-mode': {
      const mode = cmd.payload.mode as TradingMode;
      if (!MODE_PRESETS[mode]) {
        logger.warn('[VibeController] Unknown mode', { mode });
        return currentState;
      }
      next.mode = mode;
      Object.assign(next, MODE_PRESETS[mode]);
      break;
    }

    case 'filter-markets': {
      next.marketFilter = (cmd.payload.filter as string) ?? null;
      break;
    }

    case 'pause-market': {
      const id = cmd.payload.marketId as string;
      if (id && !next.pausedMarkets.includes(id)) {
        next.pausedMarkets = [...next.pausedMarkets, id];
      }
      break;
    }

    case 'resume-market': {
      const id = cmd.payload.marketId as string;
      next.pausedMarkets = next.pausedMarkets.filter((m) => m !== id);
      break;
    }

    case 'set-param': {
      const param = cmd.payload.param as keyof VibeState;
      const value = cmd.payload.value;
      if (param in next) {
        (next as unknown as Record<string, unknown>)[param] = value;
      } else {
        logger.warn('[VibeController] Unknown param', { param });
        return currentState;
      }
      break;
    }

    default:
      logger.warn('[VibeController] Unknown action', { action: cmd.action });
      return currentState;
  }

  return next;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Synchronous read — zero latency for hot paths (ILP solver, signal validator) */
export function getVibeState(): VibeState {
  return currentState;
}

/**
 * Initialize the vibe controller.
 * - Loads last known state from Redis (fail-safe: balanced defaults)
 * - Subscribes to `vibe.command` via message bus
 * - Publishes state updates to `vibe.state.updated`
 */
export async function initVibeController(): Promise<void> {
  await loadStateFromRedis();

  const bus = await createMessageBus();

  await bus.subscribe<VibeCommand>(VIBE_TOPICS.COMMAND, async (envelope) => {
    const cmd = envelope.data;
    const next = applyCommand(cmd);

    if (next === currentState) return; // no-op — invalid command was logged

    currentState = next;

    logger.info('[VibeController] State updated', {
      mode: next.mode,
      updatedBy: next.updatedBy,
      marketFilter: next.marketFilter,
      pausedMarkets: next.pausedMarkets,
    });

    await persistState(next);
    await bus.publish(VIBE_TOPICS.STATE_UPDATED, next, 'vibe-controller');
  });

  logger.info('[VibeController] Ready', { mode: currentState.mode });
}
