#!/bin/bash
# Auto-start Cloudflare quick tunnel + update DNS record for api.cashclaw.cc
# Run on M1 Max: bash scripts/start-tunnel.sh

set -e

ZONE_ID="55eb2c4e1b196327befa48913fb37b99"
CF_TOKEN="${CLOUDFLARE_API_TOKEN:-ZGmz0rgZp4l8q8YYp8Qo9nDpu-rJbbg0QnxCkWVu}"
LOCAL_PORT="${1:-3000}"
LOG_FILE="/tmp/tunnel.log"

echo "[tunnel] Starting cloudflared quick tunnel → localhost:$LOCAL_PORT"

# Kill existing tunnel
pkill -f 'cloudflared tunnel' 2>/dev/null || true
sleep 1

# Start tunnel with HTTP/2 (QUIC blocked on some networks)
cloudflared tunnel --url "http://localhost:$LOCAL_PORT" --protocol http2 --no-autoupdate > "$LOG_FILE" 2>&1 &
TUNNEL_PID=$!

# Wait for tunnel URL
echo "[tunnel] Waiting for tunnel URL..."
for i in $(seq 1 20); do
  TUNNEL_URL=$(grep -o 'https://[^ ]*trycloudflare.com' "$LOG_FILE" 2>/dev/null | head -1)
  if [ -n "$TUNNEL_URL" ]; then
    break
  fi
  sleep 1
done

if [ -z "$TUNNEL_URL" ]; then
  echo "[tunnel] ERROR: Failed to get tunnel URL after 20s"
  cat "$LOG_FILE"
  exit 1
fi

echo "[tunnel] URL: $TUNNEL_URL"

# Update api.cashclaw.cc DNS to point to new tunnel URL
HOSTNAME=$(echo "$TUNNEL_URL" | sed 's|https://||')

# Delete existing api record
EXISTING=$(curl -s "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?name=api.cashclaw.cc" \
  -H "Authorization: Bearer $CF_TOKEN" 2>/dev/null | python3 -c "import sys,json; r=json.load(sys.stdin)['result']; print(r[0]['id'] if r else '')" 2>/dev/null)

if [ -n "$EXISTING" ]; then
  curl -s -X DELETE "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records/$EXISTING" \
    -H "Authorization: Bearer $CF_TOKEN" > /dev/null 2>&1
fi

# Create new CNAME pointing to tunnel
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $CF_TOKEN" \
  -H "Content-Type: application/json" \
  --data "{\"type\":\"CNAME\",\"name\":\"api\",\"content\":\"$HOSTNAME\",\"proxied\":false}" > /dev/null 2>&1

echo "[tunnel] DNS updated: api.cashclaw.cc → $HOSTNAME"
echo "[tunnel] PID: $TUNNEL_PID"
echo "[tunnel] Test: curl https://api.cashclaw.cc/api/health"
echo "[tunnel] Logs: tail -f $LOG_FILE"

# Keep running
wait $TUNNEL_PID
