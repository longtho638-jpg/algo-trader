#!/bin/bash
# Deploy algo-trade to M1 Max production server
# Usage: ./scripts/deploy-m1-max.sh
# Requires: sshpass installed, M1 Max at 192.168.11.111

set -e

HOST="macbook@192.168.11.111"
PASS='    '  # 4 spaces
SSH_OPTS="-o ConnectTimeout=10 -o PubkeyAuthentication=no -o StrictHostKeyChecking=no -o PreferredAuthentications=password"

echo "=== Deploying algo-trade to M1 Max ==="

# Test connection
echo "Testing SSH connection..."
sshpass -p "$PASS" ssh $SSH_OPTS $HOST 'echo "Connected to $(hostname)"' || {
  echo "ERROR: Cannot connect to M1 Max. Is it powered on and on the network?"
  exit 1
}

# Deploy
echo "Pulling latest code..."
sshpass -p "$PASS" ssh $SSH_OPTS $HOST 'cd ~/projects/algo-trader && PATH="/opt/homebrew/bin:$PATH" && git pull origin main'

echo "Installing dependencies..."
sshpass -p "$PASS" ssh $SSH_OPTS $HOST 'cd ~/projects/algo-trader && PATH="/opt/homebrew/bin:$PATH" && pnpm install --frozen-lockfile 2>/dev/null || npm install'

echo "Restarting PM2..."
sshpass -p "$PASS" ssh $SSH_OPTS $HOST 'PATH="/opt/homebrew/bin:$PATH" && pm2 restart algo-trade || pm2 start ~/projects/algo-trader/src/app.ts --name algo-trade --interpreter tsx'

echo "Checking PM2 status..."
sshpass -p "$PASS" ssh $SSH_OPTS $HOST 'PATH="/opt/homebrew/bin:$PATH" && pm2 status algo-trade'

echo "Smoke test..."
sleep 3
sshpass -p "$PASS" ssh $SSH_OPTS $HOST 'curl -s http://localhost:3000/api/health | head -c 200'

echo ""
echo "=== Deploy complete ==="
