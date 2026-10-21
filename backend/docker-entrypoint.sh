#!/bin/sh
set -e

echo "=== CashFlow Backend Container Starting ==="

# Ensure data directory exists
mkdir -p /app/data

# Run database migrations safely
echo "Applying database migrations..."
npx prisma migrate deploy

echo "Starting CashFlow backend server..."
exec node dist/main.js
