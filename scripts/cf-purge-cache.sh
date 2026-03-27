#!/bin/sh
# Purge Cloudflare cache for algo-trader
# Usage: CLOUDFLARE_API_TOKEN=xxx CLOUDFLARE_ZONE_ID=xxx sh scripts/cf-purge-cache.sh

set -e

if [ -z "$CLOUDFLARE_API_TOKEN" ] || [ -z "$CLOUDFLARE_ZONE_ID" ]; then
  echo "ERROR: Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID env vars"
  exit 1
fi

echo "Purging Cloudflare cache..."

RESULT=$(curl -s -X POST \
  "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/purge_cache" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{"purge_everything":true}')

SUCCESS=$(echo "$RESULT" | grep -o '"success":true' || true)

if [ -n "$SUCCESS" ]; then
  echo "Cache purged successfully"
else
  echo "ERROR: Cache purge failed"
  echo "$RESULT"
  exit 1
fi
