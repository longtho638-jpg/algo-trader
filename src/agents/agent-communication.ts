/**
 * Agent Communication Protocol — A2A message schemas and shared state.
 * Inspired by Portkey middleware patterns for multi-agent coordination.
 */

import { AgentEventBus } from '../a2ui/agent-event-bus';
import { AgentEventType } from '../a2ui/types';
import { logger } from '../utils/logger';

/** Message types for agent-to-agent communication */
export enum MessageType {
  PROPOSAL = 'PROPOSAL',
  VETO = 'VETO',
  APPROVAL = 'APPROVAL',
  INFORMATION = 'INFORMATION',
  REQUEST = 'REQUEST',
  RESPONSE = 'RESPONSE',
}

/** Agent message for inter-agent communication */
export interface AgentMessage {
  id: string;
  type: MessageType;
  senderId: string;
  recipientId?: string; // Undefined for broadcast
  tenantId: string;
  timestamp: number;
  payload: Record<string, unknown>;
  correlationId?: string; // For request-response pairing
}

/** Shared state key-value store */
export interface SharedState {
  [key: string]: {
    value: unknown;
    version: number;
    updatedAt: number;
    ownerId: string;
  };
}

/**
 * Agent Communication Manager — handles message routing and protocols.
 */
export class AgentCommunicationManager {
  private eventBus: AgentEventBus;
  private messageQueue: AgentMessage[] = [];
  private handlers = new Map<MessageType, Array<(msg: AgentMessage) => void>>();

  constructor(eventBus: AgentEventBus) {
    this.eventBus = eventBus;
  }

  /** Send a message to another agent or broadcast */
  async send(message: Omit<AgentMessage, 'id' | 'timestamp'>): Promise<string> {
    const fullMessage: AgentMessage = {
      ...message,
      id: this.generateId(),
      timestamp: Date.now(),
    };

    logger.debug(`[AgentComm] Sending ${message.type} from ${message.senderId}`);
    this.messageQueue.push(fullMessage);

    // Emit as agent event for UI visibility
    await this.eventBus.emit({
      type: AgentEventType.THOUGHT_SUMMARY,
      tenantId: message.tenantId,
      timestamp: fullMessage.timestamp,
      steps: [`${message.senderId}: ${message.type}`],
      conclusion: JSON.stringify(message.payload),
    });

    // Call registered handlers
    const handlers = this.handlers.get(message.type) || [];
    for (const handler of handlers) {
      try {
        handler(fullMessage);
      } catch (error) {
        logger.error(`[AgentComm] Handler error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return fullMessage.id;
  }

  /** Register a handler for a message type */
  on(type: MessageType, handler: (msg: AgentMessage) => void): () => void {
    const handlers = this.handlers.get(type) || [];
    handlers.push(handler);
    this.handlers.set(type, handlers);

    return () => {
      const current = this.handlers.get(type) || [];
      this.handlers.set(type, current.filter(h => h !== handler));
    };
  }

  /** Get pending messages */
  getPendingMessages(): AgentMessage[] {
    return [...this.messageQueue];
  }

  /** Clear pending messages */
  clearMessages(): void {
    this.messageQueue = [];
  }

  private generateId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Shared State Manager — distributed state for agent coordination.
 */
export class SharedStateManager {
  private state: SharedState = {};
  private eventBus: AgentEventBus;
  private versionHistory = new Map<string, Array<{ value: unknown; timestamp: number }>>();

  constructor(eventBus: AgentEventBus, maxHistorySize = 100) {
    this.eventBus = eventBus;
    this.maxHistorySize = maxHistorySize;
  }

  private maxHistorySize: number;

  /** Get a value from shared state */
  get<T>(key: string): T | undefined {
    const entry = this.state[key];
    return entry ? (entry.value as T) : undefined;
  }

  /** Set a value in shared state */
  set<T>(key: string, value: T, ownerId: string): void {
    const previous = this.state[key];
    const newVersion = (previous?.version ?? 0) + 1;

    this.state[key] = {
      value,
      version: newVersion,
      updatedAt: Date.now(),
      ownerId,
    };

    // Track history
    const history = this.versionHistory.get(key) || [];
    history.push({ value, timestamp: Date.now() });
    if (history.length > this.maxHistorySize) {
      history.shift();
    }
    this.versionHistory.set(key, history);

    logger.debug(`[SharedState] Set ${key} (v${newVersion}) by ${ownerId}`);
  }

  /** Delete a key from shared state */
  delete(key: string): boolean {
    const existed = key in this.state;
    if (existed) {
      delete this.state[key];
      logger.debug(`[SharedState] Deleted ${key}`);
    }
    return existed;
  }

  /** Check if key exists */
  has(key: string): boolean {
    return key in this.state;
  }

  /** Get all keys */
  keys(): string[] {
    return Object.keys(this.state);
  }

  /** Get state with metadata */
  getWithMeta(key: string): { value: unknown; version: number; updatedAt: number; ownerId: string } | undefined {
    return this.state[key];
  }

  /** Get version history for a key */
  getHistory(key: string): { value: unknown; timestamp: number }[] {
    return this.versionHistory.get(key) || [];
  }

  /** Clear all state */
  clear(): void {
    this.state = {};
    this.versionHistory.clear();
  }
}

/**
 * Create agent communication infrastructure.
 * Factory function for setting up A2A protocol.
 */
export function createAgentCommunication(eventBus: AgentEventBus): {
  commManager: AgentCommunicationManager;
  stateManager: SharedStateManager;
} {
  const commManager = new AgentCommunicationManager(eventBus);
  const stateManager = new SharedStateManager(eventBus);

  return { commManager, stateManager };
}
