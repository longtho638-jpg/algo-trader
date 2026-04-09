#!/bin/bash
set -euo pipefail
echo "═══ CashClaw Dry Run — 14 Day Validation ═══"
echo "Start: $(date)"
echo "Config: config/dry-run.yaml"
echo ""

# Verify models are running
curl -sf http://localhost:11435/health > /dev/null || { echo "ERROR: DeepSeek R1 not running on :11435"; exit 1; }
curl -sf http://localhost:11436/health > /dev/null || { echo "ERROR: Nemotron not running on :11436"; exit 1; }

# Verify Polymarket connection
python -c "from core.markets import PolymarketClient; c = PolymarketClient(); print(f'Markets: {len(c.get_active_markets())}')" || { echo "ERROR: Polymarket connection failed"; exit 1; }

echo "All systems healthy. Starting dry run..."
python -m core.dry_run --config config/dry-run.yaml
