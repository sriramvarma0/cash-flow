# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules (e.g. bcrypt)
RUN apk add --no-cache python3 make g++ openssl libc6-compat

# Copy package manifests
COPY backend/package*.json ./

# Install all dependencies including devDependencies for build
RUN npm install

# Copy Prisma schema and generate client
COPY backend/prisma ./prisma
RUN npx prisma generate

# Copy source code and build
COPY backend/tsconfig*.json ./
COPY backend/nest-cli.json ./
COPY backend/src ./src

RUN npm run build

# Stage 2: Production Dependencies Only
FROM node:20-alpine AS deps

WORKDIR /app

RUN apk add --no-cache python3 make g++ openssl libc6-compat

COPY backend/package*.json ./
RUN npm install --omit=dev

# Stage 3: Production Runner
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000
ENV DATABASE_URL="file:/app/data/cashflow.db"

# Install runtime dependencies (OpenSSL required by Prisma, curl for healthcheck)
RUN apk add --no-cache openssl libc6-compat curl

# Create dedicated non-root user and persistent data directory
RUN addgroup -g 1001 -S cashflow && \
    adduser -S -u 1001 -G cashflow cashflow && \
    mkdir -p /app/data && \
    chown -R cashflow:cashflow /app

# Copy production dependencies and generated Prisma client
COPY --from=deps --chown=cashflow:cashflow /app/node_modules ./node_modules
COPY --from=builder --chown=cashflow:cashflow /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=cashflow:cashflow /app/node_modules/@prisma ./node_modules/@prisma

# Copy built application and prisma migrations
COPY --from=builder --chown=cashflow:cashflow /app/dist ./dist
COPY --from=builder --chown=cashflow:cashflow /app/prisma ./prisma
COPY --from=builder --chown=cashflow:cashflow /app/package.json ./package.json
COPY --chown=cashflow:cashflow backend/docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh

USER cashflow

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:4000/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
