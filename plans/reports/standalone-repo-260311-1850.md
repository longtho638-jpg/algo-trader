# 🦀 AlgoTrader — Repo Tách Độc Lập (Standalone)

**Date:** 2026-03-11
**Status:** ✅ HOÀN THÀNH

---

## Tóm tắt

Đã tách `apps/algo-trader` từ mekong-cli monorepo thành repo độc lập trên GitHub với mô hình RaaS (ROI-as-a-Service) open source.

---

## Repository

| Property | Value |
|----------|-------|
| **URL** | https://github.com/longtho638-jpg/algo-trader |
| **Package** | `@mekong/algo-trader` |
| **Version** | 1.0.0 |
| **License** | MIT |
| **Access** | Public |

---

## Changes Applied

### 1. Package.json Updates

```json
{
  "name": "@mekong/algo-trader",
  "version": "1.0.0",
  "types": "dist/index.js",
  "files": ["dist", "scripts", "config"],
  "bin": { "algo-trader": "./dist/index.js" },
  "scripts": {
    "prepublishOnly": "npm run build && npm test",
    "prepare": "npm run build"
  },
  "repository": "github:longtho638-jpg/algo-trader",
  "publishConfig": { "access": "public" }
}
```

**Removed:**
- `@mekong/trading-core: workspace:*`
- `@mekong/vibe-arbitrage-engine: workspace:*`

### 2. Git & GitHub

- ✅ Created standalone git repo
- ✅ Pushed 1108 files (195K+ lines)
- ✅ CI/CD workflows copied
- ✅ Branch: `main`

### 3. Files Included

```
algo-trader/
├── src/              # Full source code
├── dashboard/        # React web UI
├── scripts/          # Setup & deployment
├── config/           # YAML configs
├── tests/            # Jest + Playwright tests
├── prisma/           # Database schema
├── docs/             # Documentation
├── .github/          # CI/CD workflows
├── package.json      # Standalone config
└── README.md         # RaaS documentation
```

---

## RaaS Model

| Tier | Features | Price |
|------|----------|-------|
| **Open Source** | Core trading, 1 exchange | Free |
| **Pro** | Multi-exchange arb, AGI, dashboard | $49/mo |
| **Enterprise** | Unlimited, SLA, support | $199/mo |

**Monetization:** Polar.sh webhooks + usage billing

---

## Next Steps

### Immediate

1. ✅ ~~Create repo~~ DONE
2. ✅ ~~Push code~~ DONE
3. ⏳ Setup npm publish (run `npm publish --access public`)
4. ⏳ Configure Polar.sh products

### Short-term

- Setup npm registry integration
- Configure auto-publish on release
- Add changelog automation
- Setup issue templates

---

## Commands

### Install from npm (after publish)

```bash
npm install @mekong/algo-trader
```

### Local development

```bash
cd algo-trader
npm install
npm run setup
npm run quickstart
```

### Publish to npm

```bash
npm version 1.0.0
npm publish --access public
```

---

## Unresolved Questions

- npm package name: Use `@mekong/algo-trader` or `algo-trader`?
- Polar.sh product setup: Need to create subscription tiers
- Domain: Deploy dashboard to `algo-trader.vercel.app`?

---

**Report Generated:** 2026-03-11 18:50 ICT
**Author:** OpenClaw Agent
