# Stage 1: Dependencies
FROM node:20-alpine AS deps

WORKDIR /app

RUN apk add --no-cache libc6-compat

COPY frontend/package*.json ./
RUN npm install

# Stage 2: Builder
FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache libc6-compat

COPY --from=deps /app/node_modules ./node_modules
COPY frontend/ ./

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Support custom API base URL at build time if needed
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL:-http://localhost:4000}

RUN npm run build

# Stage 3: Runner
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN apk add --no-cache curl libc6-compat

# Create dedicated non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3000 || exit 1

CMD ["node", "server.js"]
