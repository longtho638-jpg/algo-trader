# Phase 03: Create Queues

**Priority:** High | **Status:** Pending | **Parallel Group:** 1

---

## Context

- Parent Plan: [[plan.md]]
- Dependencies: None (can run in parallel with Phases 01, 02, 04)

---

## Overview

Create Cloudflare Queues for background job processing.

---

## Implementation Steps

### Step 1: Create Producer Queues

```bash
# Backtest queue
wrangler queues create backtest-queue

# Scan queue
wrangler queues create scan-queue

# Webhook queue
wrangler queues create webhook-queue
```

### Step 2: Create Dead Letter Queues

```bash
# DLQ for backtest
wrangler queues create backtest-dlq

# DLQ for scan
wrangler queues create scan-dlq

# DLQ for webhook
wrangler queues create webhook-dlq
```

### Step 3: Update wrangler.toml (if needed)

Queue names in wrangler.toml already match - no ID sync needed.

```toml
[[queues.producers]]
queue = "backtest-queue"
binding = "BACKTEST_QUEUE"

[[queues.producers]]
queue = "scan-queue"
binding = "SCAN_QUEUE"

[[queues.producers]]
queue = "webhook-queue"
binding = "WEBHOOK_QUEUE"

[[queues.consumers]]
queue = "backtest-queue"
max_batch_size = 10
max_retries = 3
dead_letter_queue = "backtest-dlq"
```

---

## Success Criteria

- [ ] 3 producer queues created
- [ ] 3 DLQs created
- [ ] Queue names verified in wrangler.toml

---

## Conflict Prevention

This phase only runs wrangler CLI commands - no file conflicts with other phases.
