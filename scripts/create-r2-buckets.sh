#!/bin/bash
# R2 Bucket Creation Script
# IMPORTANT: R2 bucket creation requires Cloudflare Dashboard action first
# Improved: Better error handling, pre-flight checks, rollback support

set -e

echo "========================================"
echo "R2 BUCKET CREATION"
echo "========================================"
echo ""

# Pre-flight: Check wrangler auth
echo "Checking authentication..."
if ! pnpm exec wrangler whoami > /dev/null 2>&1; then
    echo "❌ Not authenticated with Cloudflare"
    echo "Run: pnpm exec wrangler login"
    exit 1
fi
echo "✅ Authenticated"
echo ""

# Check if R2 is enabled (using exit code, not string parsing)
echo "Checking R2 status..."
if ! pnpm exec wrangler r2 bucket list > /dev/null 2>&1; then
    echo "⚠️  R2 is not enabled for this account"
    echo ""
    echo "👉 Steps to enable R2:"
    echo ""
    echo "1. Go to https://dash.cloudflare.com"
    echo "2. Navigate to R2 in the left sidebar"
    echo "3. Click 'Create bucket' (any name, e.g., 'test')"
    echo "4. This enables R2 for your account"
    echo "5. Come back and re-run this script"
    echo ""
    exit 1
fi
echo "✅ R2 is enabled"
echo ""

# Track created buckets for rollback
created_buckets=()
cleanup() {
    if [ ${#created_buckets[@]} -gt 0 ]; then
        echo ""
        echo "Cleaning up created buckets..."
        for bucket in "${created_buckets[@]}"; do
            echo "  Deleting: $bucket"
            pnpm exec wrangler r2 bucket delete "$bucket" --force 2>/dev/null || true
        done
    fi
}
trap cleanup EXIT

# Create buckets
BUCKET_PROD="algo-trader-artifacts"
BUCKET_STAGING="algo-trader-artifacts-staging"

echo "Creating buckets..."
echo ""

# Production bucket
echo "Creating: $BUCKET_PROD"
if pnpm exec wrangler r2 bucket create "$BUCKET_PROD" 2>&1; then
    echo "  ✅ Created: $BUCKET_PROD"
    created_buckets+=("$BUCKET_PROD")
else
    # Check if already exists
    if pnpm exec wrangler r2 bucket list 2>&1 | grep -q "$BUCKET_PROD"; then
        echo "  ⚠️  Already exists: $BUCKET_PROD"
    else
        echo "  ❌ Failed to create: $BUCKET_PROD"
        exit 1
    fi
fi

# Staging bucket
echo "Creating: $BUCKET_STAGING"
if pnpm exec wrangler r2 bucket create "$BUCKET_STAGING" 2>&1; then
    echo "  ✅ Created: $BUCKET_STAGING"
    created_buckets+=("$BUCKET_STAGING")
else
    if pnpm exec wrangler r2 bucket list 2>&1 | grep -q "$BUCKET_STAGING"; then
        echo "  ⚠️  Already exists: $BUCKET_STAGING"
    else
        echo "  ❌ Failed to create: $BUCKET_STAGING"
        exit 1
    fi
fi

# Success - disable rollback trap
trap - EXIT

echo ""
echo "========================================"
echo "VERIFICATION"
echo "========================================"
echo ""
pnpm exec wrangler r2 bucket list 2>&1 | head -20
echo ""
echo "✅ R2 bucket creation complete!"
echo ""
echo "Next: Run ./scripts/setup-secrets.sh"
