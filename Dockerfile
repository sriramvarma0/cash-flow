# ==============================================================================
# CashFlow Single-Container Production Dockerfile
# Packages both Next.js Frontend and NestJS Backend into a single production container.
# Production uses Cloudflare D1 as the SQL database (zero local database dependency).
# ==============================================================================

# --- Stage 1: Base Alpine Node.js ---
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# --- Stage 2: Install all dependencies (for build) ---
FROM base AS deps
RUN apk add --no-cache python3 make g++

COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

RUN npm ci

# --- Stage 3: Builder ---
FROM base AS builder
WORKDIR /app

COPY package*.json tsconfig.base.json* ./
COPY backend ./backend
COPY frontend ./frontend
COPY scripts ./scripts

# Copy node_modules from deps stage (root and workspace-specific)
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/backend/node_modules ./backend/node_modules

ENV PATH="/app/backend/node_modules/.bin:/app/node_modules/.bin:${PATH}"
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV DATABASE_URL="file:./dev.db"

# Generate Prisma Client (with driverAdapters support)
RUN npx prisma generate --schema=backend/prisma/schema.prisma

# Build both applications (frontend Next.js standalone + backend NestJS)
RUN npm run build

# --- Stage 4: Production Dependencies Only ---
FROM base AS prod-deps
RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

RUN npm ci --omit=dev

# Copy generated Prisma Client into production node_modules
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# --- Stage 5: Production Runner ---
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV BACKEND_PORT=4000
ENV HOSTNAME="0.0.0.0"
ENV INTERNAL_BACKEND_URL=http://127.0.0.1:4000
ENV BACKEND_URL=http://127.0.0.1:4000
ENV DATABASE_PROVIDER=d1
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_PATH=/app/node_modules

# Install runtime utilities (curl for healthcheck)
RUN apk add --no-cache curl

# Create dedicated non-root user
RUN addgroup -g 1001 -S cashflow && \
    adduser -S -u 1001 -G cashflow cashflow && \
    mkdir -p /app/data && \
    chown -R cashflow:cashflow /app

# 1. Copy backend runtime artifacts & production dependencies
COPY --from=prod-deps --chown=cashflow:cashflow /app/node_modules ./node_modules
COPY --from=builder --chown=cashflow:cashflow /app/frontend/.next/standalone/node_modules ./node_modules
COPY --from=builder --chown=cashflow:cashflow /app/backend/dist ./backend/dist
COPY --from=builder --chown=cashflow:cashflow /app/backend/prisma ./backend/prisma
COPY --from=builder --chown=cashflow:cashflow /app/backend/package.json ./backend/package.json

# 2. Copy frontend Next.js standalone artifacts
COPY --from=builder --chown=cashflow:cashflow /app/frontend/.next/standalone/frontend ./frontend
COPY --from=builder --chown=cashflow:cashflow /app/frontend/.next/static ./frontend/.next/static
COPY --from=builder --chown=cashflow:cashflow /app/frontend/public ./frontend/public

# 3. Copy management scripts & root manifests
COPY --from=builder --chown=cashflow:cashflow /app/scripts ./scripts
COPY --from=builder --chown=cashflow:cashflow /app/package.json ./package.json

RUN chmod +x ./scripts/*.js

USER cashflow

# Expose single public application port (Frontend serves UI and proxies API to backend)
EXPOSE 3000

# Container healthcheck: verifies frontend, internal backend, and database connectivity
HEALTHCHECK --interval=20s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Launch supervisor to manage and monitor both servers
CMD ["node", "scripts/start-container.js"]
