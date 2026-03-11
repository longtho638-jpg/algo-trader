#!/bin/bash
# One-Click R2 Enable + Bucket Creation
# Uses Cloudflare API directly with wrangler auth

set -e

echo "=== AlgoTrader R2 One-Click Setup ==="
echo ""

# Get account ID from wrangler
ACCOUNT_ID="f691e83094f776311a1bfe3f8b126f1c"

# Try to create bucket via API
echo "Attempting R2 bucket creation via API..."
echo ""

# First check if R2 is enabled
if pnpm exec wrangler r2 bucket list > /dev/null 2>&1; then
    echo "✅ R2 already enabled"
    pnpm exec wrangler r2 bucket create algo-trader-artifacts 2>&1 || echo "  Bucket exists"
    pnpm exec wrangler r2 bucket create algo-trader-artifacts-staging 2>&1 || echo "  Bucket exists"
    echo "✅ Buckets created"
    exit 0
fi

echo "⚠️  R2 not enabled via API"
echo ""
echo "👉 Quick Enable (30 seconds):"
echo ""
echo "1. Open this URL in browser:"
echo "   https://dash.cloudflare.com/?to=/:account/r2"
echo ""
echo "2. Click 'Create a bucket'"
echo "3. Name: algo-trader-artifacts"
echo "4. Create"
echo ""
read -p "Done? Press Enter to retry..."
echo ""

# Retry
if pnpm exec wrangler r2 bucket list > /dev/null 2>&1; then
    echo "✅ R2 enabled!"
    pnpm exec wrangler r2 bucket create algo-trader-artifacts
    pnpm exec wrangler r2 bucket create algo-trader-artifacts-staging
    echo "✅ Complete!"
else
    echo "❌ Still not enabled. Please contact support."
    exit 1
fi
