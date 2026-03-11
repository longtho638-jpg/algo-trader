---
description: 📺 Trading dashboard — dev server, build, deploy
argument-hint: [action: dev|build|status]
---

**Think** để quản lý dashboard: <args>$ARGUMENTS</args>

## Context

CWD: `apps/algo-trader`
Dashboard: `apps/algo-trader/dashboard/` (Vite + React)
API: `apps/algo-trader/src/api/` (Fastify)

## Commands

### dev — Start development server
```bash
cd apps/algo-trader && pnpm dashboard:dev
```
→ Opens at `http://localhost:5173`

### build — Production build
```bash
cd apps/algo-trader && pnpm dashboard:build
```
→ Output: `dashboard/dist/`

### api — Start API server (serves dashboard + REST API)
```bash
cd apps/algo-trader && pnpm api:serve
```
→ API at `http://localhost:3001`

### status — Check running services
```bash
curl -sI http://localhost:5173 2>/dev/null | head -1 || echo "Dashboard: not running"
curl -sI http://localhost:3001 2>/dev/null | head -1 || echo "API: not running"
```

## Features

- Real-time P&L tracking via WebSocket
- Exchange health dashboard
- Strategy performance charts
- Arbitrage signal monitor
- Trade history & logs
