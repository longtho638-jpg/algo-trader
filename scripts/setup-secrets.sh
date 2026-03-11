#!/bin/bash
# Secrets Setup Script
# Sets all required secrets for production and staging environments
# Security: Validates input, confirms secrets, checks auth first

set -e

echo "========================================"
echo "SECRET SETUP - ALGOTRADER"
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

# Required secrets list
REQUIRED_SECRETS=("DATABASE_URL" "EXCHANGE_API_KEY" "EXCHANGE_SECRET" "POLAR_WEBHOOK_SECRET")

# Function to set a secret with validation and confirmation
set_secret() {
    local secret_name=$1
    local env_flag=$2
    local is_critical=$3

    echo "Setting $secret_name..."

    # First attempt
    read -sp "  Enter value for $secret_name (min 8 chars): " secret_value
    echo ""

    # Validation: minimum length
    if [ ${#secret_value} -lt 8 ]; then
        echo "  ⚠️  Secret must be at least 8 characters"
        if [ "$is_critical" = "true" ]; then
            echo "  ❌ Critical secret cannot be empty. Aborting."
            exit 1
        fi
        read -p "  Skip this secret? (y/n): " -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            return 0
        else
            # Re-prompt
            read -sp "  Enter value for $secret_name: " secret_value
            echo ""
        fi
    fi

    # Confirmation for critical secrets
    if [ "$is_critical" = "true" ]; then
        read -sp "  Confirm $secret_name: " confirm_value
        echo ""
        if [ "$secret_value" != "$confirm_value" ]; then
            echo "  ❌ Values don't match. Aborting."
            exit 1
        fi
    fi

    # Set secret using stdin (avoids process list exposure)
    if ! printf '%s' "$secret_value" | pnpm exec wrangler secret put "$secret_name" $env_flag 2>&1; then
        echo "  ❌ Failed to set $secret_name"
        if [ "$is_critical" = "true" ]; then
            echo "  Critical secret failed. Aborting."
            exit 1
        fi
    else
        echo "  ✅ Set: $secret_name"
    fi
}

echo "PRODUCTION SECRETS"
echo "----------------------------------------"
for secret in "${REQUIRED_SECRETS[@]}"; do
    set_secret "$secret" "" "true"
done

echo ""
read -p "Set staging secrets? (y/n): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "STAGING SECRETS"
    echo "----------------------------------------"
    # Check if staging values are same as production
    read -p "Use same values as production? (y/n): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "✅ Skipping staging (uses same secrets as production)"
    else
        for secret in "${REQUIRED_SECRETS[@]}"; do
            set_secret "$secret" "--env staging" "true"
        done
    fi
fi

echo ""
echo "========================================"
echo "VERIFICATION"
echo "========================================"
echo ""
echo "Production secrets:"
pnpm exec wrangler secret list 2>&1 | head -20 || echo "Unable to list secrets"
echo ""
echo "Staging secrets:"
pnpm exec wrangler secret list --env staging 2>&1 | head -20 || echo "Unable to list secrets"
echo ""
echo "✅ Secrets setup complete!"
echo ""
echo "Next steps:"
echo "1. Run: pnpm exec wrangler deploy --dry-run"
echo "2. Verify: pnpm exec wrangler deploy"
