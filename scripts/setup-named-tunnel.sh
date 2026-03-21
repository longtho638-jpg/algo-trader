#!/bin/bash
# Setup named Cloudflare tunnel for algo-trade RaaS
# This creates a persistent tunnel that routes api.cashclaw.cc → localhost:3000
#
# Prerequisites:
#   1. cloudflared installed (brew install cloudflared)
#   2. Run: cloudflared tunnel login  (interactive — opens browser for Cloudflare auth)
#
# Usage: bash scripts/setup-named-tunnel.sh

set -e

TUNNEL_NAME="algo-trade"
DOMAIN="api.cashclaw.cc"
LOCAL_PORT="${1:-3000}"

echo "=== algo-trade Named Tunnel Setup ==="
echo ""

# Check cloudflared is installed
if ! command -v cloudflared &>/dev/null; then
  echo "[ERROR] cloudflared not found. Install: brew install cloudflared"
  exit 1
fi

# Check if logged in
if [ ! -f "$HOME/.cloudflared/cert.pem" ]; then
  echo "[SETUP] Not logged in. Running cloudflared tunnel login..."
  echo "        This will open a browser window for Cloudflare authentication."
  cloudflared tunnel login
fi

# Check if tunnel already exists
EXISTING_ID=$(cloudflared tunnel list --output json 2>/dev/null | python3 -c "
import sys, json
tunnels = json.load(sys.stdin)
for t in tunnels:
    if t['name'] == '$TUNNEL_NAME':
        print(t['id'])
        break
" 2>/dev/null || echo "")

if [ -n "$EXISTING_ID" ]; then
  echo "[INFO] Tunnel '$TUNNEL_NAME' already exists (ID: $EXISTING_ID)"
  TUNNEL_ID="$EXISTING_ID"
else
  echo "[SETUP] Creating tunnel '$TUNNEL_NAME'..."
  cloudflared tunnel create "$TUNNEL_NAME"
  TUNNEL_ID=$(cloudflared tunnel list --output json | python3 -c "
import sys, json
tunnels = json.load(sys.stdin)
for t in tunnels:
    if t['name'] == '$TUNNEL_NAME':
        print(t['id'])
        break
")
  echo "[OK] Tunnel created: $TUNNEL_ID"
fi

# Route DNS
echo "[SETUP] Routing $DOMAIN → tunnel $TUNNEL_NAME..."
cloudflared tunnel route dns "$TUNNEL_NAME" "$DOMAIN" 2>/dev/null || echo "[INFO] DNS route may already exist"

# Create config file
CONFIG_DIR="$HOME/.cloudflared"
CONFIG_FILE="$CONFIG_DIR/config-algo-trade.yml"

cat > "$CONFIG_FILE" << EOF
tunnel: $TUNNEL_ID
credentials-file: $CONFIG_DIR/${TUNNEL_ID}.json

ingress:
  - hostname: $DOMAIN
    service: http://localhost:$LOCAL_PORT
  - service: http_status:404
EOF

echo "[OK] Config written: $CONFIG_FILE"
echo ""
echo "=== Setup Complete ==="
echo ""
echo "To start the tunnel:"
echo "  cloudflared tunnel --config $CONFIG_FILE run $TUNNEL_NAME"
echo ""
echo "To run as PM2 process:"
echo "  pm2 start cloudflared --name cf-tunnel -- tunnel --config $CONFIG_FILE run $TUNNEL_NAME"
echo ""
echo "Test: curl https://$DOMAIN/api/health"
