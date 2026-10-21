#!/usr/bin/env node

/**
 * Cloudflare D1 Migration Runner
 * 
 * Applies Prisma SQLite migrations from backend/prisma/migrations/
 * directly to a remote Cloudflare D1 database via Cloudflare REST API.
 * Tracks applied migrations in the `_cf_d1_migrations` table to ensure
 * idempotency, atomic commits, and safe reruns.
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = process.cwd();
const MIGRATIONS_DIR = fs.existsSync(path.join(ROOT_DIR, 'backend/prisma/migrations'))
  ? path.join(ROOT_DIR, 'backend/prisma/migrations')
  : path.join(ROOT_DIR, 'prisma/migrations');

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;
const isDryRun = process.argv.includes('--dry-run');

console.log('====================================================');
console.log('   Cloudflare D1 Migration Runner');
console.log('====================================================');

if (!accountId || !databaseId || !apiToken) {
  console.error('[d1-migrate] Error: Missing required Cloudflare credentials.');
  console.error('[d1-migrate] Required environment variables:');
  console.error('  - CLOUDFLARE_ACCOUNT_ID');
  console.error('  - CLOUDFLARE_D1_DATABASE_ID');
  console.error('  - CLOUDFLARE_API_TOKEN');
  process.exit(1);
}

const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;

async function executeD1Query(sql, params = []) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiToken}`
    },
    body: JSON.stringify({ sql, params }),
    signal: AbortSignal.timeout(30000)
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.success) {
    const errorMsg =
      body.errors?.[0]?.message ||
      body.messages?.[0]?.message ||
      `Query failed with status ${response.status}: ${JSON.stringify(body)}`;
    throw new Error(errorMsg);
  }

  return body.result?.[0] || {};
}

function sanitizeSqlForD1(sql) {
  // Strip PRAGMA foreign_keys = OFF / ON because Cloudflare D1 permanently enforces foreign keys
  // and rejects attempts to toggle them (SQLITE_AUTH).
  // PRAGMA defer_foreign_keys = ON (which Prisma migrations already include) is fully supported
  // by D1 for temporary foreign key deferrals during table rebuilds in a transaction.
  return sql.replace(/^\s*PRAGMA\s+foreign_keys\s*=\s*(OFF|ON);?/gim, '-- [D1] skipped foreign_keys pragma');
}

async function runMigrations() {
  console.log(`[d1-migrate] Target D1 Database ID: ${databaseId}`);
  console.log(`[d1-migrate] Checking migration tracking table...`);

  if (!isDryRun) {
    // 1. Ensure tracking table exists
    await executeD1Query(`
      CREATE TABLE IF NOT EXISTS _cf_d1_migrations (
        migration_name TEXT PRIMARY KEY,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  // 2. Fetch applied migrations
  let appliedSet = new Set();
  try {
    const result = await executeD1Query(`SELECT migration_name FROM _cf_d1_migrations`);
    const rows = result.results || [];
    appliedSet = new Set(rows.map((r) => r.migration_name));
    console.log(`[d1-migrate] Found ${appliedSet.size} previously applied migrations.`);
  } catch (err) {
    if (!isDryRun) {
      console.warn(`[d1-migrate] Note reading migration history: ${err.message}`);
    }
  }

  // 3. Discover migration directories in chronological order
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.error(`[d1-migrate] Migrations directory not found at: ${MIGRATIONS_DIR}`);
    process.exit(1);
  }

  const entries = fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort(); // Lexicographical sort is strictly chronological given timestamp folder names

  console.log(`[d1-migrate] Discovered ${entries.length} total migrations in repository.`);

  const pendingMigrations = entries.filter((name) => !appliedSet.has(name));

  if (pendingMigrations.length === 0) {
    console.log('[d1-migrate] ✅ Cloudflare D1 database schema is completely up to date!');
    return;
  }

  console.log(`[d1-migrate] ${pendingMigrations.length} pending migrations to apply:`);
  for (const name of pendingMigrations) {
    console.log(`  - ${name}`);
  }

  if (isDryRun) {
    console.log('[d1-migrate] Dry run finished. No changes executed.');
    return;
  }

  // 4. Apply each migration atomically with its tracking record
  for (const migrationName of pendingMigrations) {
    const sqlFilePath = path.join(MIGRATIONS_DIR, migrationName, 'migration.sql');
    if (!fs.existsSync(sqlFilePath)) {
      console.warn(`[d1-migrate] Warning: migration.sql missing in ${migrationName}, skipping.`);
      continue;
    }

    const rawSql = fs.readFileSync(sqlFilePath, 'utf8').trim();
    const sanitizedSql = sanitizeSqlForD1(rawSql);
    console.log(`[d1-migrate] Applying ${migrationName}...`);

    // Combine schema DDL and tracking insert into one atomic statement execution
    const combinedSql = sanitizedSql
      ? `${sanitizedSql}\nINSERT INTO _cf_d1_migrations (migration_name) VALUES ('${migrationName}');`
      : `INSERT INTO _cf_d1_migrations (migration_name) VALUES ('${migrationName}');`;

    await executeD1Query(combinedSql);
    console.log(`[d1-migrate] ✅ Successfully applied ${migrationName}`);
  }

  console.log('====================================================');
  console.log('[d1-migrate] ✅ All migrations successfully applied to Cloudflare D1!');
  console.log('====================================================');
}

runMigrations().catch((err) => {
  console.error('[d1-migrate] ❌ FATAL Migration Error:', err.message);
  process.exit(1);
});
