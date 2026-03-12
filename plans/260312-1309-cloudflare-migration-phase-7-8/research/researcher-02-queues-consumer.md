---
name: Queue Consumer Implementation Research
description: Cloudflare Workers queue() handler with Hono framework
type: research
---

# Queue Consumer Implementation Research

## 1. Queue Handler Export Format

Cloudflare Workers with Hono need **named export** for queue handler:

```typescript
// src/api/gateway.ts
import app from './gateway'; // Hono app

export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch, env: Env): Promise<void> {
    // Process messages
    for (const msg of batch.messages) {
      const body = msg.body as any;
      console.log(`Processing: ${msg.id}`, body);
    }
    batch.ackAll(); // Acknowledge on success
  }
};
```

**Key:** Export default object with `fetch` + `queue` methods.

## 2. MessageBatch Processing

```typescript
interface MessageBatch {
  queue: string;
  messages: Array<{
    id: string;
    body: unknown;
    timestamp: Date;
    attempts: number;
  }>;
  retryAll(): void; // Retry all messages
  ackAll(): void;   // Acknowledge all (success)
}
```

**Pattern:**
```typescript
async queue(batch: MessageBatch, env: Env): Promise<void> {
  for (const msg of batch.messages) {
    try {
      await processMessage(msg.body, env);
      msg.ack(); // Individual ack
    } catch (err) {
      console.error(`Failed ${msg.id}:`, err);
      // Auto-retry based on wrangler.toml config
    }
  }
}
```

## 3. Error Handling + DLQ

DLQ configured in `wrangler.toml`:
```toml
[[queues.consumers]]
queue = "backtest-queue"
max_batch_size = 10
max_retries = 3
dead_letter_queue = "backtest-dlq"
```

**After max_retries exhausted → auto-moves to DLQ.**

## 4. Hono-Specific Notes

- Hono doesn't have queue middleware (queues are Worker-level)
- Queue handler bypasses Hono router entirely
- Use Hono app for HTTP, export.queue for background jobs

## 5. Implementation Checklist

- [ ] Change export from `export default app` to object with fetch + queue
- [ ] Add `Env` type with queue bindings
- [ ] Implement processMessage() for each queue type
- [ ] Add logging/metrics
- [ ] Test with `wrangler dev`

## Sources

- [Cloudflare Workers Queues Docs](https://developers.cloudflare.com/queues/)
- [MessageBatch API Reference](https://developers.cloudflare.com/queues/api/message-batch/)

**Unresolved:** None - pattern is well-documented.
