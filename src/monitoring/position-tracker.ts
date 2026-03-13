/**
 * PositionTracker — Position lifecycle event tracking
 *
 * Features:
 * - Track position lifecycle: opened, adjusted, closed
 * - Event emission: position:opened, position:closed, position:updated
 * - Low-latency event logging (<50ms)
 *
 * @module monitoring
 */

import type { Position } from '../core/PortfolioManager';
import { logger } from '../utils/logger';
import { EventEmitter } from 'events';

/**
 * Position lifecycle event types
 */
export type PositionEventType = 'position:opened' | 'position:closed' | 'position:updated';

/**
 * Position event payload
 */
export interface PositionEvent {
  type: PositionEventType;
  position: Position;
  timestamp: number;
  latencyMs: number;
}

/**
 * Position lifecycle callback
 */
export type PositionEventHandler = (event: PositionEvent) => void;

/**
 * PositionTracker — Tracks position lifecycle events
 */
export class PositionTracker extends EventEmitter {
  private readonly positionTimestamps: Map<string, number> = new Map();
  private eventHistory: PositionEvent[] = [];
  private readonly maxHistorySize = 1000;

  /**
   * Record position opened event
   */
  trackOpened(position: Position): void {
    const now = Date.now();
    this.positionTimestamps.set(position.id, now);

    const event: PositionEvent = {
      type: 'position:opened',
      position,
      timestamp: now,
      latencyMs: 0,
    };

    this.emitEvent(event);
    logger.info(
      `PositionTracker: Position opened ${position.id} | ` +
      `Market=${position.marketId} | Side=${position.side} | Size=${position.size}`
    );
  }

  /**
   * Record position updated event
   */
  trackUpdated(position: Position): void {
    const now = Date.now();
    const openedAt = this.positionTimestamps.get(position.id) || now;
    const latency = now - openedAt;

    const event: PositionEvent = {
      type: 'position:updated',
      position,
      timestamp: now,
      latencyMs: latency,
    };

    this.emitEvent(event);
    logger.debug(
      `PositionTracker: Position updated ${position.id} | ` +
      `UnrealizedPnL=${position.unrealizedPnl.toFixed(4)} | Latency=${latency}ms`
    );
  }

  /**
   * Record position closed event
   */
  trackClosed(position: Position): void {
    const now = Date.now();
    const openedAt = this.positionTimestamps.get(position.id) || position.openedAt;
    const latency = now - openedAt;

    const event: PositionEvent = {
      type: 'position:closed',
      position,
      timestamp: now,
      latencyMs: latency,
    };

    this.emitEvent(event);
    this.positionTimestamps.delete(position.id);

    logger.info(
      `PositionTracker: Position closed ${position.id} | ` +
      `RealizedPnL=${position.realizedPnl.toFixed(4)} | Latency=${latency}ms`
    );
  }

  /**
   * Get event history
   */
  getHistory(limit: number = 100): PositionEvent[] {
    return this.eventHistory.slice(-limit);
  }

  /**
   * Get average latency for event type
   */
  getAverageLatency(type?: PositionEventType): number {
    const events = type
      ? this.eventHistory.filter(e => e.type === type)
      : this.eventHistory;

    if (events.length === 0) return 0;

    const total = events.reduce((sum, e) => sum + e.latencyMs, 0);
    return total / events.length;
  }

  /**
   * Emit event to listeners and store in history
   */
  private emitEvent(event: PositionEvent): void {
    // Emit to all listeners
    this.emit(event.type, event);
    this.emit('position:*', event);

    // Store in history
    this.eventHistory.push(event);

    // Trim old events
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Reset state (for testing)
   */
  reset(): void {
    this.positionTimestamps.clear();
    this.eventHistory = [];
    this.removeAllListeners();
  }
}

/**
 * Global position tracker instance
 */
let globalPositionTracker: PositionTracker | null = null;

export function getGlobalPositionTracker(): PositionTracker {
  if (!globalPositionTracker) {
    globalPositionTracker = new PositionTracker();
  }
  return globalPositionTracker;
}

/**
 * Reset global instance (for testing)
 */
export function resetGlobalPositionTracker(): void {
  globalPositionTracker?.reset();
  globalPositionTracker = null;
}
