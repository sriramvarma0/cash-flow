#!/usr/bin/env node

/**
 * CashFlow Production Container Supervisor
 * 
 * Manages the lifecycle of both the NestJS backend and Next.js frontend
 * within a single production container:
 * 1. Checks and validates DATABASE_PROVIDER (sqlite vs d1).
 * 2. Executes provider-appropriate database migrations (if enabled).
 * 3. Spawns and monitors both server processes independently.
 * 4. Enforces fault domain integrity: if either server dies, the supervisor
 *    safely shuts down the surviving server and exits non-zero so Docker can
 *    restart or replace the container.
 * 5. Gracefully propagates SIGTERM / SIGINT signals with timeouts.
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const BACKEND_PORT = process.env.BACKEND_PORT || '4000';
const FRONTEND_PORT = process.env.PORT || '3000';
const AUTO_MIGRATE = process.env.AUTO_MIGRATE !== 'false';
const ROOT_DIR = process.cwd();
const DATABASE_PROVIDER = (process.env.DATABASE_PROVIDER || 'sqlite').trim().toLowerCase();

console.log('====================================================');
console.log('   CashFlow Single-Container Process Supervisor');
console.log('====================================================');
console.log(`[supervisor] Mode: ${process.env.NODE_ENV || 'production'}`);
console.log(`[supervisor] Frontend Port (Public): ${FRONTEND_PORT}`);
console.log(`[supervisor] Backend Port (Internal): ${BACKEND_PORT}`);
console.log(`[supervisor] Database Provider: [${DATABASE_PROVIDER.toUpperCase()}]`);

// 1. Validate Database Provider & Execute Migrations
if (DATABASE_PROVIDER === 'd1') {
  console.log('[supervisor] Validating Cloudflare D1 production configuration...');
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const httpUrl = process.env.CLOUDFLARE_D1_HTTP_URL;

  if (!httpUrl && (!accountId || !databaseId || !apiToken)) {
    console.error(
      '[supervisor] FATAL: DATABASE_PROVIDER=d1 requires CLOUDFLARE_ACCOUNT_ID, ' +
      'CLOUDFLARE_D1_DATABASE_ID, and CLOUDFLARE_API_TOKEN (or CLOUDFLARE_D1_HTTP_URL). ' +
      'Aborting to prevent silent fallback to ephemeral local storage.'
    );
    process.exit(1);
  }

  console.log(`[supervisor] Cloudflare D1 Target Database: ${databaseId || 'custom-http'}`);

  // Prevent concurrent migrations across multiple Azure Container App replicas.
  // Cloudflare D1 migrations are executed centrally in the CI/CD deployment pipeline before rollout.
  if (process.env.AUTO_MIGRATE === 'true') {
    console.log('[supervisor] AUTO_MIGRATE=true requested. Executing Cloudflare D1 migration runner...');
    const d1MigrateScript = path.join(ROOT_DIR, 'scripts/d1-migrate.js');
    if (fs.existsSync(d1MigrateScript)) {
      try {
        execSync(`node "${d1MigrateScript}"`, {
          stdio: 'inherit',
          env: process.env
        });
      } catch (migErr) {
        console.error('[supervisor] FATAL: Cloudflare D1 migration failed!', migErr.message);
        process.exit(1);
      }
    } else {
      console.warn('[supervisor] Warning: scripts/d1-migrate.js not found, skipping migration check.');
    }
  } else {
    console.log('[supervisor] Cloudflare D1 migrations are managed centrally in CI/CD pipeline. Skipping container-startup migration.');
  }
} else if (DATABASE_PROVIDER === 'sqlite') {
  console.log('[supervisor] Local SQLite provider selected.');
  const dataDir = process.env.DATA_DIR || path.join(ROOT_DIR, 'data');
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      console.log(`[supervisor] Created persistent data directory at: ${dataDir}`);
    }
  } catch (err) {
    console.warn(`[supervisor] Warning creating data dir ${dataDir}:`, err.message);
  }

  if (AUTO_MIGRATE) {
    console.log('[supervisor] Checking & applying SQLite migrations...');
    try {
      const prismaSchema = fs.existsSync(path.join(ROOT_DIR, 'backend/prisma/schema.prisma'))
        ? path.join(ROOT_DIR, 'backend/prisma/schema.prisma')
        : path.join(ROOT_DIR, 'prisma/schema.prisma');

      if (fs.existsSync(prismaSchema)) {
        execSync(`npx prisma migrate deploy --schema="${prismaSchema}"`, {
          stdio: 'inherit',
          env: {
            ...process.env,
            DATABASE_URL: process.env.DATABASE_URL || 'file:/app/data/cashflow.db'
          }
        });
        console.log('[supervisor] SQLite database migrations applied successfully.');
      } else {
        console.log('[supervisor] Prisma schema not found, skipping migration step.');
      }
    } catch (migErr) {
      console.error('[supervisor] FATAL: Database migration failed!', migErr.message);
      process.exit(1);
    }
  }
} else {
  console.error(`[supervisor] FATAL: Unsupported DATABASE_PROVIDER: "${DATABASE_PROVIDER}". Must be "sqlite" or "d1".`);
  process.exit(1);
}

// 2. Helper to format prefixed logs
function pipeOutput(child, prefix) {
  child.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      if (line.trim().length > 0) {
        console.log(`[${prefix}] ${line}`);
      }
    }
  });

  child.stderr.on('data', (data) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      if (line.trim().length > 0) {
        console.error(`[${prefix}] ${line}`);
      }
    }
  });
}

// Locate server scripts
const backendEntry = fs.existsSync(path.join(ROOT_DIR, 'backend/dist/main.js'))
  ? path.join(ROOT_DIR, 'backend/dist/main.js')
  : fs.existsSync(path.join(ROOT_DIR, 'dist/main.js'))
  ? path.join(ROOT_DIR, 'dist/main.js')
  : null;

const frontendEntry = fs.existsSync(path.join(ROOT_DIR, 'frontend/server.js'))
  ? path.join(ROOT_DIR, 'frontend/server.js')
  : fs.existsSync(path.join(ROOT_DIR, 'frontend/.next/standalone/frontend/server.js'))
  ? path.join(ROOT_DIR, 'frontend/.next/standalone/frontend/server.js')
  : fs.existsSync(path.join(ROOT_DIR, 'server.js'))
  ? path.join(ROOT_DIR, 'server.js')
  : null;

if (!backendEntry) {
  console.error('[supervisor] FATAL: Backend entrypoint not found!');
  process.exit(1);
}

if (!frontendEntry) {
  console.error('[supervisor] FATAL: Frontend standalone server.js not found!');
  process.exit(1);
}

console.log(`[supervisor] Backend script:  ${backendEntry}`);
console.log(`[supervisor] Frontend script: ${frontendEntry}`);

let backendProcess = null;
let frontendProcess = null;
let isShuttingDown = false;

// 3. Spawn Backend Process
function startBackend() {
  console.log('[supervisor] Spawning backend process...');
  const backendEnv = {
    ...process.env,
    PORT: BACKEND_PORT,
    NODE_ENV: 'production',
    DATABASE_PROVIDER,
    DATABASE_URL: process.env.DATABASE_URL || 'file:/app/data/cashflow.db',
    FRONTEND_URL: process.env.FRONTEND_URL || `http://localhost:${FRONTEND_PORT}`
  };

  const child = spawn('node', [backendEntry], {
    cwd: path.dirname(backendEntry),
    env: backendEnv,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  pipeOutput(child, 'backend');

  child.on('exit', (code, signal) => {
    if (isShuttingDown) return;
    console.error(`[supervisor] CRITICAL: Backend process exited (code=${code}, signal=${signal})`);
    handleServerCrash('backend', code || 1);
  });

  return child;
}

// 4. Spawn Frontend Process
function startFrontend() {
  console.log('[supervisor] Spawning frontend process...');
  const frontendEnv = {
    ...process.env,
    PORT: FRONTEND_PORT,
    HOSTNAME: '0.0.0.0',
    NODE_ENV: 'production',
    INTERNAL_BACKEND_URL: `http://127.0.0.1:${BACKEND_PORT}`,
    BACKEND_URL: `http://127.0.0.1:${BACKEND_PORT}`,
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL || `http://localhost:${BACKEND_PORT}`
  };

  const child = spawn('node', [frontendEntry], {
    cwd: path.dirname(frontendEntry),
    env: frontendEnv,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  pipeOutput(child, 'frontend');

  child.on('exit', (code, signal) => {
    if (isShuttingDown) return;
    console.error(`[supervisor] CRITICAL: Frontend process exited (code=${code}, signal=${signal})`);
    handleServerCrash('frontend', code || 1);
  });

  return child;
}

// 5. Fault domain handler: if one crashes, shutdown both and exit
function handleServerCrash(source, exitCode) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.error(`[supervisor] Server '${source}' failure detected. Terminating surviving processes...`);

  if (backendProcess && !backendProcess.killed) {
    try { backendProcess.kill('SIGTERM'); } catch (_) {}
  }
  if (frontendProcess && !frontendProcess.killed) {
    try { frontendProcess.kill('SIGTERM'); } catch (_) {}
  }

  setTimeout(() => {
    console.error('[supervisor] Container exiting due to critical process failure.');
    process.exit(exitCode || 1);
  }, 1000);
}

// 6. Graceful Shutdown on SIGTERM / SIGINT
function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[supervisor] Received ${signal}. Initiating graceful shutdown...`);

  let remaining = 2;
  const onChildDone = () => {
    remaining -= 1;
    if (remaining <= 0) {
      console.log('[supervisor] All processes gracefully terminated. Exiting 0.');
      process.exit(0);
    }
  };

  const killTimeout = setTimeout(() => {
    console.warn('[supervisor] Shutdown timeout reached (10s). Forcing SIGKILL...');
    if (backendProcess && !backendProcess.killed) backendProcess.kill('SIGKILL');
    if (frontendProcess && !frontendProcess.killed) frontendProcess.kill('SIGKILL');
    process.exit(0);
  }, 10000);

  if (backendProcess) {
    backendProcess.once('exit', onChildDone);
    backendProcess.kill('SIGTERM');
  } else {
    onChildDone();
  }

  if (frontendProcess) {
    frontendProcess.once('exit', onChildDone);
    frontendProcess.kill('SIGTERM');
  } else {
    onChildDone();
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start both applications
backendProcess = startBackend();
frontendProcess = startFrontend();

console.log('[supervisor] Both servers spawned and monitored.');
