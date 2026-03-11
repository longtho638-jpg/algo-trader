/**
 * Cloudflare Queues producer/consumer adapter - replaces BullMQ
 * Uses Workers Queues for background job processing
 */

// Type declarations for Cloudflare Workers Queues
declare global {
  interface Queue<Body = unknown> {
    send(message: Body, options?: { contentType?: string; delaySeconds?: number }): Promise<void>;
    sendBatch(messages: Array<Body & { contentType?: string; delaySeconds?: number }>): Promise<void>;
  }

  interface Message<Body = unknown> {
    readonly id: string;
    readonly timestamp: Date;
    readonly body: Body;
    readonly attempts: number;
    ack(): void;
    retry(options?: { delaySeconds?: number }): void;
  }

  interface QueueConsumerConfig {
    max_batch_size?: number;
    max_retries?: number;
    dead_letter_queue?: string;
  }
}

export const QUEUE_NAMES = {
  BACKTEST: 'backtest-queue',
  SCAN: 'scan-queue',
  WEBHOOK: 'webhook-queue',
  OPTIMIZATION: 'optimization-queue',
} as const;

export interface QueueJobOptions {
  delaySeconds?: number;
  contentType?: string;
}

export interface QueuedJob<T = unknown> {
  id: string;
  data: T;
  timestamp: number;
}

/** Queue Producer - sends jobs to Cloudflare Queues */
export class QueueProducer<T> {
  private queue: Queue<unknown>;

  constructor(queue: Queue<unknown>) {
    this.queue = queue;
  }

  async send(data: T, options?: QueueJobOptions): Promise<string> {
    const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const payload: QueuedJob<T> = {
      id: jobId,
      data,
      timestamp: Date.now(),
    };

    await this.queue.send(payload, {
      contentType: options?.contentType ?? 'json',
      delaySeconds: options?.delaySeconds ?? 0,
    });

    return jobId;
  }

  async sendBatch(jobs: Array<{ data: T; options?: QueueJobOptions }>): Promise<string[]> {
    const payloads = jobs.map(j => ({
      id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      data: j.data,
      timestamp: Date.now(),
      contentType: j.options?.contentType ?? 'json',
      delaySeconds: j.options?.delaySeconds ?? 0,
    }));

    await this.queue.sendBatch(payloads);
    return payloads.map(p => p.id);
  }
}

/** Job handler interface for consumers */
export interface JobHandler<T, R = void> {
  (job: QueuedJob<T>): Promise<R>;
}

/** Retry configuration */
export interface RetryConfig {
  maxRetries: number;
  backoffMs: number;
}

/** Queue Consumer - processes jobs from Cloudflare Queues */
export class QueueConsumer<T, R = void> {
  private handler: JobHandler<T, R>;
  private retryConfig: RetryConfig;

  constructor(
    handler: JobHandler<T, R>,
    retryConfig: RetryConfig = { maxRetries: 3, backoffMs: 1000 }
  ) {
    this.handler = handler;
    this.retryConfig = retryConfig;
  }

  /**
   * Process a batch of messages from the queue
   * Called by Workers runtime via queue consumer binding
   */
  async processBatch(messages: Message<QueuedJob<T>>[]): Promise<void> {
    for (const message of messages) {
      try {
        await this.handler(message.body);
        message.ack();
      } catch (error) {
        const attempts = message.attempts;
        if (attempts >= this.retryConfig.maxRetries) {
          console.error(`[QueueConsumer] Job ${message.body.id} failed after ${attempts} attempts`, error);
          message.ack(); // Ack to move to DLQ
        } else {
          const delay = this.retryConfig.backoffMs * Math.pow(2, attempts - 1);
          console.warn(`[QueueConsumer] Job ${message.body.id} failed, retry ${attempts}/${this.retryConfig.maxRetries} in ${delay}ms`);
          message.retry({ delaySeconds: Math.floor(delay / 1000) });
        }
      }
    }
  }
}

/** Factory functions for creating producers/consumers */

export function createProducer<T>(queue: Queue<unknown>): QueueProducer<T> {
  return new QueueProducer<T>(queue);
}

export function createConsumer<T, R = void>(
  handler: JobHandler<T, R>,
  retryConfig?: RetryConfig
): QueueConsumer<T, R> {
  return new QueueConsumer<T, R>(handler, retryConfig);
}

/**
 * Backtest job data and result types
 */
export interface BacktestJobData {
  tenantId: string;
  strategyName: string;
  pair: string;
  timeframe: string;
  days: number;
  initialBalance: number;
  feeRate?: number;
  riskPercentage?: number;
  slippageBps?: number;
}

export interface BacktestJobResult {
  tenantId: string;
  strategyName: string;
  finalBalance: number;
  totalReturn: number;
  maxDrawdown: number;
  totalTrades: number;
  winRate: number;
  sharpeRatio: number;
  completedAt: number;
}

/**
 * Scan job data for arbitrage detection
 */
export interface ScanJobData {
  tenantId: string;
  pairs: string[];
  exchanges: string[];
  minSpreadPercent: number;
  maxAgeMs: number;
}

/**
 * Webhook delivery job data
 */
export interface WebhookJobData {
  tenantId: string;
  url: string;
  payload: Record<string, unknown>;
  headers?: Record<string, string>;
  maxRetries: number;
}
