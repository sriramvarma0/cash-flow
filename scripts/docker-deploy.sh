#!/bin/bash
set -e

echo "=== CashFlow Docker Production Deployment ==="

# Determine root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

# 1. Pull latest Docker images from Docker Hub
echo "1. Pulling latest images from Docker Hub..."
docker compose pull

# 2. Recreate containers with latest images
echo "2. Recreating containers with latest production images..."
docker compose up -d --remove-orphans

# 3. Wait and check service health
echo "3. Waiting for services to become healthy..."
sleep 8

if curl -s -f "http://localhost:4000/health" > /dev/null; then
  echo "✅ Backend container is healthy!"
else
  echo "❌ Error: Backend container failed health check!"
  docker compose logs backend --tail 50
  exit 1
fi

if curl -s -f "http://localhost:3000" > /dev/null; then
  echo "✅ Frontend container is live!"
else
  echo "❌ Warning: Frontend container health check returned non-200. Checking logs..."
  docker compose logs frontend --tail 50
fi

echo "=== Deployment Succeeded! ==="
docker compose ps
