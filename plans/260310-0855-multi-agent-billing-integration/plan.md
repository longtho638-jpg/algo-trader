---
title: "Multi-Agent Trading + Webhook Billing Integration"
description: "Implement multi-agent trading system với webhook billing SDK cho algo-trader"
status: pending
priority: P1
effort: 8h
branch: master
tags: [multi-agent, billing, webhook, trading-system]
created: 2026-03-10
---

# Multi-Agent Trading + Webhook Billing Integration Plan

## Overview

**Mục tiêu:** Implement 2 hệ thống chính cho algo-trader (4510 tests passing):

1. **Multi-Agent Trading System** - Architecture phân tán với 5 agents chuyên biệt
2. **Webhook Billing SDK** - Polar.sh webhook handling + subscription lifecycle

**Assets hiện có:**
- `AgentEventBus` (src/a2ui/agent-event-bus.ts)
- `AutonomyController` (src/core/autonomy-controller.ts)
- `PluginSystem` (src/core/bot-engine-plugins.ts)
- `PolarWebhookEventHandler` (src/billing/)
- `DunningStateMachine` (src/billing/)
- Prisma schema (subscription, dunning, audit)

## Phases

| Phase | Description | Effort | Status |
|-------|-------------|--------|--------|
| [Phase 1](./phase-01-multi-agent-trading-system.md) | Multi-Agent Trading System | 5h | pending |
| [Phase 2](./phase-02-webhook-billing-sdk.md) | Webhook Billing SDK Integration | 3h | pending |

## Dependencies

```
Phase 1 → Phase 2
  ↓          ↓
Tests      Tests
  ↓          ↓
Review ←───┘
```

## Success Criteria

- [ ] 5 agents hoạt động với event bus
- [ ] Webhook handler xử lý 6 Polar events
- [ ] Tests passing (4510+ tests)
- [ ] Build TypeScript không lỗi
- [ ] Production deploy GREEN

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Event bus bottleneck | High | Optimize handler async, add batching |
| Webhook idempotency | Medium | Use eventId dedup + audit log |
| Agent coordination | High | Clear contract via base-agent.ts |
| Dunning timeout | Medium | Cron job monitoring + alert |

---

**Next Step:** Activate `planner` agent để chi tiết hóa Phase 1.
