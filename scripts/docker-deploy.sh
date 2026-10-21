#!/bin/bash
set -e

echo "=== CashFlow Single-Container Production Deployment ==="

# Determine root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

# 1. Pull latest Docker image from Docker Hub
echo "1. Pulling latest unified image from Docker Hub..."
docker compose pull

# 2. Recreate container with latest image
echo "2. Recreating container with latest production image..."
docker compose up -d --remove-orphans

# 3. Wait and check service health
echo "3. Waiting for CashFlow unified container to become healthy..."
sleep 10

if curl -s -f "http://localhost:3000/api/health" > /dev/null; then
  echo "✅ CashFlow container is healthy! (Frontend and Backend verified)"
else
  echo "❌ Error: CashFlow container health check failed!"
  docker compose logs cashflow --tail 50
  exit 1
fi

echo "=== Deployment Succeeded! ==="
docker compose ps
