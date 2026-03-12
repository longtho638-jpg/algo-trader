# Phase 02: Implement Queue Consumers

**Parent:** [plan.md](./plan.md) | **Dependencies:** None | **Parallel:** Yes

---

## Overview

Add queue() handler to gateway.ts to enable async processing of backtest and scan jobs.

**Priority:** High | **Effort:** 1-2 hours

---

## Key Insights

- Queue handler requires `export default { fetch, queue }` pattern
- Hono app handles HTTP, queue handler processes background jobs
- DLQ configured in wrangler.toml after 3 retries

---

## Requirements

1. Implement queue() handler in gateway.ts
2. Process backtest-queue messages
3. Process scan-queue messages
4. Process webhook-queue messages
5. Add error handling with DLQ support
6. Add logging for observability

---

## Architecture

```
Producer (Worker) → Queue → Consumer (Worker.queue()) → Process → Ack/Retry
```

---

## Related Code Files

**Modified:**
- `src/api/gateway.ts` (lines 235-239 - currently exports `app as handler`)

**Files to Create:**
- `src/queues/backtest-processor.ts`
- `src/queues/scan-processor.ts`
- `src/queues/webhook-processor.ts`

---

## File Ownership

| File | Change |
|------|--------|
| `src/api/gateway.ts` | Add queue() export |
| `src/queues/*.ts` | Create new processors |

---

## Implementation Steps

### Step 1: Create Queue Processors

**src/queues/backtest-processor.ts:**
```typescript
import { Env } from '../api/gateway';

export async function processBacktestJob(body: unknown, env: Env): Promise<void> {
  const job = body as { id: string; params: any };
  console.log(`Processing backtest ${job.id}:`, job.params);
  // TODO: Implement backtest execution logic
}
```

**src/queues/scan-processor.ts:**
```typescript
export async function processScanJob(body: unknown, env: Env): Promise<void> {
  const job = body as { id: string; pairs: string[] };
  console.log(`Processing scan ${job.id}:`, job.pairs);
  // TODO: Implement market scan logic
}
```

**src/queues/webhook-processor.ts:**
```typescript
export async function processWebhookJob(body: unknown, env: Env): Promise<void> {
  const event = body as { type: string; payload: any };
  console.log(`Processing webhook ${event.type}:`, event.payload);
  // TODO: Handle Polar webhook events
}
```

### Step 2: Update gateway.ts Export

**Current (line 235-239):**
```typescript
export default app;
export { app as handler };
```

**New:**
```typescript
import { processBacktestJob } from './queues/backtest-processor';
import { processScanJob } from './queues/scan-processor';
import { processWebhookJob } from './queues/webhook-processor';

export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch, env: Env): Promise<void> {
    const queueName = batch.queue;

    for (const msg of batch.messages) {
      try {
        switch (queueName) {
          case 'backtest-queue':
            await processBacktestJob(msg.body, env);
            break;
          case 'scan-queue':
            await processScanJob(msg.body, env);
            break;
          case 'webhook-queue':
            await processWebhookJob(msg.body, env);
            break;
          default:
            console.warn(`Unknown queue: ${queueName}`);
        }
        msg.ack();
      } catch (err) {
        console.error(`Queue error [${queueName}][${msg.id}]:`, err);
        throw err; // Triggers retry/DLQ
      }
    }
  }
};

export { app as handler };
```

### Step 3: Update wrangler.toml (Uncomment Consumers)

```toml
[[queues.consumers]]
queue = "backtest-queue"
max_batch_size = 10
max_retries = 3
dead_letter_queue = "backtest-dlq"

[[queues.consumers]]
queue = "scan-queue"
max_batch_size = 5
max_retries = 3
dead_letter_queue = "scan-dlq"

[[queues.consumers]]
queue = "webhook-queue"
max_batch_size = 20
max_retries = 5
dead_letter_queue = "webhook-dlq"
```

### Step 4: Deploy & Test

```bash
npm run deploy:prod

# Test: Send test message
curl -X POST https://algo-trader-worker.agencyos-openclaw.workers.dev/api/v1/backtest \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

---

## Todo List

- [ ] Create src/queues/backtest-processor.ts
- [ ] Create src/queues/scan-processor.ts
- [ ] Create src/queues/webhook-processor.ts
- [ ] Update gateway.ts queue export
- [ ] Uncomment consumers in wrangler.toml
- [ ] Deploy Worker
- [ ] Verify queue consumers in Cloudflare Dashboard

---

## Success Criteria

- Worker deploys without errors
- Queue consumers show "Active" in dashboard
- Test messages processed successfully
- Failed messages retry and move to DLQ after 3 attempts

---

## Conflict Prevention

Exclusive ownership of `src/api/gateway.ts` - no other phase modifies this file.

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Queue processing fails | High | DLQ captures failed messages |
| Memory timeout | Medium | Keep batch size small (5-10) |
| Message format mismatch | Medium | Add schema validation |

---

## Security Considerations

- Validate message schema before processing
- Sanitize user input in job payloads
- Log all processing for audit trail

---

## Next Steps

After completion:
- Queues will process jobs asynchronously
- Phase 04 can use queues for SOP execution
