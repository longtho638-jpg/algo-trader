# CashClaw — AI-Powered Prediction Market Trading

[![CI](https://github.com/longtho638-jpg/algo-trader/actions/workflows/ci.yml/badge.svg)](https://github.com/longtho638-jpg/algo-trader/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-4233%20passing-brightgreen.svg)](package.json)

Polymarket market-making bot with dual-LLM fair value estimation, Kelly Criterion sizing, and 40+ trading strategies.

---

## Quick Start

```bash
git clone https://github.com/longtho638-jpg/algo-trader.git
cd algo-trader
bash scripts/dev-setup.sh    # install deps, create .env, verify build
```

The setup script handles everything: pnpm install, .env creation, TypeScript check, test run.

After setup, edit `.env` with your Polymarket API keys, then:

```bash
pnpm start                   # Start bot (paper trading by default)
```

---

## Architecture

```
M1 Max bare metal (64GB macOS)
├── mlx_lm.server :11435      DeepSeek R1 32B   (deep reasoning, ~10 tok/s)
├── mlx_lm.server :11436      Nemotron Nano 30B (fast triage, ~45 tok/s)
├── alphaear-sidecar :8100     FinBERT + Kronos  (sentiment + forecasting)
│
├── Docker: cashclaw-bot       Trading engine    (no ports, outbound only)
│   ├── → host.docker.internal:11435  (DeepSeek R1)
│   ├── → host.docker.internal:11436  (Nemotron Nano)
│   └── → host.docker.internal:8100   (AlphaEar sidecar)
│
└── API/Dashboard/Landing      :3000 / :3001 / :3002
```

### LLM Routing

| Model | Port | Role | Speed | Timeout |
|-------|------|------|-------|---------|
| DeepSeek R1 32B | :11435 | Deep reasoning before large trades | ~10 tok/s | 90s |
| Nemotron Nano 30B | :11436 | Fast fair value estimation | ~45 tok/s | 10s |
| Ollama (fallback) | :11434 | Backup if MLX servers down | ~12 tok/s | 30s |
| Claude API (last resort) | cloud | Complex analysis | varies | 60s |

### Intelligence Sidecar (Optional)

AlphaEar wraps [Awesome-finance-skills](https://github.com/RKiding/Awesome-finance-skills) into a FastAPI server:

| Endpoint | Capability |
|----------|------------|
| `/sentiment/analyze` | FinBERT deep financial sentiment |
| `/predict/forecast` | Kronos time-series forecasting (MPS) |
| `/news/hot` | 14-source news aggregation |
| `/signal/track` | Signal evolution tracking |

Setup: `cd intelligence && bash setup.sh && python server.py`

---

## Development

### Prerequisites

- **Node.js** v20+ (v22 recommended)
- **pnpm** (auto-installed via corepack)
- **Python 3.12** (only for intelligence sidecar, optional)

### Commands

```bash
pnpm start              # Start trading bot (paper mode)
pnpm test               # Run test suite (4233 tests)
pnpm run check          # TypeScript type check
pnpm run build          # Compile to dist/
```

### CLI Commands

```bash
# Core
algo start              # Start trading bot
algo status             # Bot status
algo backtest           # Run backtests
algo config             # View/edit configuration

# AI Estimation
algo estimate <question># AI probability estimation
algo calibrate          # Calibrate model parameters
algo warm-model         # Pre-heat DeepSeek R1
algo hft-loop           # Continuous 24/7 trading loop

# Dark Edge (Polymarket Alpha)
algo neg-risk-scan      # Multi-outcome YES sum arbitrage
algo endgame            # Near-certain resolving markets
algo resolution-arb     # UMA oracle challenge windows
algo whale-watch        # Polygon CTF whale movements
algo news-snipe         # News-driven momentum detection
```

### Project Structure

```
src/
├── api/                 REST API endpoints + auth middleware
├── agents/              19 specialist agents (scan, estimate, risk...)
├── config/              LLM config, env-driven settings
├── core/                Types, config, logger, risk manager
├── data/                SQLite database, sentiment feed, price feeds
├── dashboard/           Dashboard server + PWA frontend
├── engine/              Strategy runner, trade executor
├── intelligence/        AlphaEar client + Kronos fair value
├── landing/             Landing page server + auth pages
├── lib/                 LLM router (MLX → Ollama → Cloud)
├── polymarket/          CLOB client, order manager, pipeline, fees
├── strategies/          40+ trading strategies
├── notifications/       Telegram, Discord, Slack, Email, Webhook
├── copy-trading/        Copy trading + fee collection
├── growth/              UTM tracking, badges, PnL share cards
└── ui/                  Shared design system (tokens.css, components.css)

intelligence/            Python FastAPI sidecar (FinBERT, Kronos)
docker/                  Docker compose for M1 Max deployment
tests/                   Vitest test suite (226 files, 4233 tests)
```

---

## Environment Variables

All env vars are documented in `.env.example`. Key groups:

| Group | Variables | Required |
|-------|-----------|----------|
| **Polymarket** | `POLYMARKET_PRIVATE_KEY`, `POLYMARKET_API_KEY`, `POLYMARKET_PASSPHRASE` | Yes (for trading) |
| **Trading** | `PAPER_TRADING=true`, `CAPITAL_USDC=200` | Defaults safe |
| **LLM Primary** | `LLM_PRIMARY_URL`, `LLM_PRIMARY_MODEL` | Defaults to :11435 |
| **LLM Fast** | `LLM_FAST_TRIAGE_URL`, `LLM_FAST_TRIAGE_MODEL` | Defaults to :11436 |
| **Intelligence** | `ALPHAEAR_SIDECAR_URL` | Optional (:8100) |
| **Ports** | `API_PORT=3000`, `DASHBOARD_PORT=3001`, `LANDING_PORT=3002` | Defaults work |
| **Notifications** | `TELEGRAM_BOT_TOKEN`, `SMTP_*`, etc. | Optional |

---

## Docker Deployment

### CashClaw Bot (M1 Max)

```bash
# Build and start (paper trading by default)
docker compose -f docker/docker-compose.cashclaw.yaml up -d

# View logs
docker compose -f docker/docker-compose.cashclaw.yaml logs -f

# Stop (cancels all open GTC orders first)
docker compose -f docker/docker-compose.cashclaw.yaml down
```

Container connects to bare-metal LLM servers via `host.docker.internal`. SQLite data stored in Docker named volume (NOT bind mount — VirtioFS corruption risk).

See `docker/DOCKER-SAFETY.md` for auto-update protection and coexistence with other containers.

### Generic Docker (non-M1 Max)

```bash
docker compose up -d            # Uses root docker-compose.yml
docker compose --profile postgres up -d  # With PostgreSQL
```

---

## Pricing

| Tier | Price | Description |
|------|-------|-------------|
| Starter | $49/mo | Daily signal digest, Kelly sizing recommendations |
| Pro | $149/mo | Real-time signals, auto-execution, REST API |
| Elite | $499/mo | Custom market focus, personal dashboard, founder support |

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/status` | Engine status and active strategies |
| POST | `/api/strategies/start` | Start a strategy |
| POST | `/api/strategies/stop` | Stop a strategy |
| GET | `/api/portfolio` | Portfolio summary |
| GET | `/api/trades` | Trade history |
| POST | `/api/backtest` | Run backtest |
| GET | `/api/analytics` | P&L and performance metrics |

---

## Contributing

1. Fork the repository
2. Run `bash scripts/dev-setup.sh` to set up dev environment
3. Create a feature branch: `git checkout -b feat/your-feature`
4. Write tests for new code
5. Ensure `pnpm run check && pnpm test` passes (4233+ tests)
6. Commit using conventional commits: `feat: add grid trading strategy`
7. Push and open a pull request against `main`

---

## License

MIT — see [LICENSE](LICENSE) for details.
