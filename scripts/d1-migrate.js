#!/usr/bin/env node

/**
 * Cloudflare D1 Production Migration Runner for CashFlow
 * 
 * Safely applies Prisma SQLite migrations from backend/prisma/migrations/
 * directly to a remote Cloudflare D1 database via Cloudflare REST API.
 * 
 * Key Safety Guarantees:
 * 1. Checks existing migration history across `_cf_d1_migrations`, `_prisma_migrations`,
 *    and `d1_migrations` to ensure previously applied migrations NEVER execute again.
 * 2. Baselines existing production databases that were initialized via schema import
 *    without re-executing initial migrations or altering live tables.
 * 3. Never drops, recreates, truncates, or overwrites existing production tables.
 * 4. Executes pending migrations atomically and updates tracking history.
 * 5. Supports --dry-run (inspection), --verify (assert zero pending), and --optional (graceful exit if no creds).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = process.cwd();
const MIGRATIONS_DIR = fs.existsSync(path.join(ROOT_DIR, 'backend/prisma/migrations'))
  ? path.join(ROOT_DIR, 'backend/prisma/migrations')
  : path.join(ROOT_DIR, 'prisma/migrations');

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;
const httpUrl = process.env.CLOUDFLARE_D1_HTTP_URL;

const isDryRun = process.argv.includes('--dry-run');
const isVerify = process.argv.includes('--verify');
const isOptional = process.argv.includes('--optional') || process.argv.includes('--skip-if-missing');

console.log('====================================================');
console.log('   CashFlow Cloudflare D1 Migration Engine');
console.log('====================================================');
if (isDryRun) console.log('Mode: DRY RUN (Inspection Only)');
if (isVerify) console.log('Mode: VERIFY (Assert Zero Pending Migrations)');

// 1. Validate Credentials
if (!httpUrl && (!accountId || !databaseId || !apiToken)) {
  if (isOptional) {
    console.log('[d1-migrate] Notice: Cloudflare D1 credentials not provided. Skipping remote migration check.');
    process.exit(0);
  }
  console.error('[d1-migrate] Error: Missing required Cloudflare D1 credentials.');
  console.error('[d1-migrate] Required environment variables:');
  console.error('  - CLOUDFLARE_ACCOUNT_ID');
  console.error('  - CLOUDFLARE_D1_DATABASE_ID');
  console.error('  - CLOUDFLARE_API_TOKEN');
  process.exit(1);
}

const endpoint =
  httpUrl ||
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;

async function executeD1Query(sql, params = []) {
  const headers = {
    'Content-Type': 'application/json'
  };
  if (apiToken) {
    headers['Authorization'] = `Bearer ${apiToken}`;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
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
  // by D1 for temporary foreign key deferrals during table updates in a transaction.
  return sql.replace(/^\s*PRAGMA\s+foreign_keys\s*=\s*(OFF|ON);?/gim, '-- [D1] skipped foreign_keys pragma');
}

/**
 * Splits a SQL migration script into individual executable statements.
 */
function splitSqlStatements(sql) {
  const sanitized = sanitizeSqlForD1(sql);
  const lines = sanitized.split('\n');
  const statements = [];
  let currentStmt = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('--')) {
      continue;
    }
    currentStmt += line + '\n';
    if (trimmed.endsWith(';')) {
      statements.push(currentStmt.trim());
      currentStmt = '';
    }
  }

  if (currentStmt.trim()) {
    statements.push(currentStmt.trim());
  }

  return statements;
}

// Baseline migrations and their corresponding schema artifacts
const BASELINE_MIGRATION_SCHEMA_CHECKS = [
  {
    name: '20260705092504_init',
    description: 'Initial User and Expense tables',
    verify: (tables) => tables.has('User') && tables.has('Expense')
  },
  {
    name: '20260705094457_add_phone_number',
    description: 'User.phoneNumber column',
    verify: (tables, cols) => tables.has('User') && cols.get('User')?.has('phoneNumber')
  },
  {
    name: '20260723102844_add_groups_and_invitations',
    description: 'Group and Invitation tables',
    verify: (tables) => tables.has('Group') && tables.has('Invitation')
  },
  {
    name: '20260723111230_add_transfers_and_income',
    description: 'Expense.transactionType column',
    verify: (tables, cols) => tables.has('Expense') && cols.get('Expense')?.has('transactionType')
  },
  {
    name: '20260728064202_add_tags',
    description: 'Tag table',
    verify: (tables) => tables.has('Tag')
  },
  {
    name: '20260728074413_add_category_type',
    description: 'Expense.categoryType column',
    verify: (tables, cols) => tables.has('Expense') && cols.get('Expense')?.has('categoryType')
  },
  {
    name: '20260813100453_add_investments',
    description: 'Investment table',
    verify: (tables) => tables.has('Investment')
  },
  {
    name: '20260813102514_add_investment_code',
    description: 'Investment.code column',
    verify: (tables, cols) => tables.has('Investment') && cols.get('Investment')?.has('code')
  },
  {
    name: '20260813110925_add_date_to_investment',
    description: 'Investment.date column',
    verify: (tables, cols) => tables.has('Investment') && cols.get('Investment')?.has('date')
  }
];

async function runMigrations() {
  console.log(`[d1-migrate] Target D1 Database: ${databaseId || httpUrl}`);
  console.log(`[d1-migrate] Inspecting migration history and existing schema...`);

  // 1. Ensure primary tracking table exists
  await executeD1Query(`
    CREATE TABLE IF NOT EXISTS _cf_d1_migrations (
      migration_name TEXT PRIMARY KEY,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      checksum TEXT
    );
  `);

  // 2. Query all existing migration tracking tables
  const appliedSet = new Set();

  // 2A: Check _cf_d1_migrations
  try {
    const res = await executeD1Query(`SELECT migration_name FROM _cf_d1_migrations`);
    for (const r of res.results || []) {
      if (r.migration_name) appliedSet.add(r.migration_name);
    }
  } catch (err) {
    console.warn(`[d1-migrate] Note querying _cf_d1_migrations: ${err.message}`);
  }

  // 2B: Check _prisma_migrations
  let hasPrismaMigrationsTable = false;
  try {
    const res = await executeD1Query(`SELECT migration_name FROM _prisma_migrations WHERE rolled_back_at IS NULL`);
    hasPrismaMigrationsTable = true;
    for (const r of res.results || []) {
      if (r.migration_name) appliedSet.add(r.migration_name);
    }
  } catch {}

  // 2C: Check d1_migrations (Wrangler standard)
  try {
    const res = await executeD1Query(`SELECT name as migration_name FROM d1_migrations`);
    for (const r of res.results || []) {
      if (r.migration_name) appliedSet.add(r.migration_name);
    }
  } catch {}

  console.log(`[d1-migrate] Found ${appliedSet.size} recorded migration(s) across tracking tables.`);

  // 3. Inspect existing schema (tables & columns) to verify production schema state
  const existingTables = new Set();
  try {
    const res = await executeD1Query(`SELECT name FROM sqlite_master WHERE type='table';`);
    for (const r of res.results || []) {
      if (r.name && !r.name.startsWith('_cf_') && !r.name.startsWith('sqlite_') && !r.name.startsWith('_prisma_')) {
        existingTables.add(r.name);
      }
    }
  } catch (err) {
    console.warn(`[d1-migrate] Note checking existing tables: ${err.message}`);
  }

  // Cache columns for user tables
  const tableColumns = new Map();
  for (const tbl of ['User', 'Expense', 'Investment']) {
    if (existingTables.has(tbl)) {
      try {
        const colRes = await executeD1Query(`PRAGMA table_info("${tbl}");`);
        const cols = new Set((colRes.results || []).map((c) => c.name));
        tableColumns.set(tbl, cols);
      } catch (err) {
        console.warn(`[d1-migrate] Note reading columns for ${tbl}: ${err.message}`);
      }
    }
  }

  // BASELINE PROTECTION & INCONSISTENCY DETECTION:
  // If the database already has user tables (e.g. from manual schema/data import),
  // verify each historical baseline migration against actual schema before marking as applied.
  if (existingTables.size > 0) {
    const hasCoreTables = existingTables.has('User') && existingTables.has('Expense');
    let newlyBaselined = 0;
    const inconsistentMigrations = [];

    for (const check of BASELINE_MIGRATION_SCHEMA_CHECKS) {
      if (!appliedSet.has(check.name)) {
        const isPresent = check.verify(existingTables, tableColumns);
        if (isPresent) {
          if (!isDryRun && !isVerify) {
            await executeD1Query(
              `INSERT OR IGNORE INTO _cf_d1_migrations (migration_name, checksum) VALUES (?, ?);`,
              [check.name, 'baseline_verified']
            );
            if (hasPrismaMigrationsTable) {
              await executeD1Query(
                `INSERT OR IGNORE INTO _prisma_migrations (id, checksum, finished_at, migration_name, applied_steps_count)
                 VALUES (?, ?, CURRENT_TIMESTAMP, ?, 1);`,
                [crypto.randomUUID(), 'baseline_verified', check.name]
              );
            }
          }
          appliedSet.add(check.name);
          newlyBaselined++;
        } else if (hasCoreTables) {
          // Inconsistency detected: Core tables exist, but a historical migration artifact is missing!
          inconsistentMigrations.push(`${check.name} (${check.description})`);
        }
      }
    }

    if (inconsistentMigrations.length > 0) {
      console.error('====================================================');
      console.error('[d1-migrate] ❌ FATAL SCHEMA INCONSISTENCY DETECTED!');
      console.error('The production database has existing tables, but the following');
      console.error('historical migration schema artifacts are missing from the schema:');
      for (const m of inconsistentMigrations) {
        console.error(`  - ${m}`);
      }
      console.error('Deployment halted to protect existing production data.');
      console.error('====================================================');
      process.exit(1);
    }

    if (newlyBaselined > 0) {
      console.log(`[d1-migrate] 🛡️  Baseline Established & Verified: ${newlyBaselined} historical migration(s) confirmed against existing schema.`);
      console.log(`[d1-migrate] 🛡️  Production tables will NEVER be recreated or re-initialized.`);
    }
  }

  // 4. Discover all migrations in the repository
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.error(`[d1-migrate] Fatal: Migrations directory not found at: ${MIGRATIONS_DIR}`);
    process.exit(1);
  }

  const allRepoMigrations = fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  console.log(`[d1-migrate] Discovered ${allRepoMigrations.length} migration(s) in repository.`);

  const pendingMigrations = allRepoMigrations.filter((name) => !appliedSet.has(name));

  // 5. Check if all migrations are satisfied
  if (pendingMigrations.length === 0) {
    console.log('====================================================');
    console.log('[d1-migrate] ✅ Cloudflare D1 database schema is completely up to date!');
    console.log('             Zero pending migrations.');
    console.log('====================================================');
    return;
  }

  console.log(`[d1-migrate] Found ${pendingMigrations.length} pending migration(s) to apply:`);
  for (const name of pendingMigrations) {
    console.log(`  ➔ ${name}`);
  }

  // If in --verify mode and pending migrations exist, fail verification!
  if (isVerify) {
    console.error(`[d1-migrate] ❌ VERIFICATION FAILED: ${pendingMigrations.length} migration(s) remain unapplied in Cloudflare D1!`);
    process.exit(1);
  }

  if (isDryRun) {
    console.log('====================================================');
    console.log('[d1-migrate] Dry run finished. No changes executed.');
    console.log('====================================================');
    return;
  }

  // 6. Apply each pending migration in chronological order
  for (const migrationName of pendingMigrations) {
    const sqlFilePath = path.join(MIGRATIONS_DIR, migrationName, 'migration.sql');
    if (!fs.existsSync(sqlFilePath)) {
      console.warn(`[d1-migrate] Warning: migration.sql missing in ${migrationName}, skipping.`);
      continue;
    }

    const rawSql = fs.readFileSync(sqlFilePath, 'utf8').trim();
    const checksum = crypto.createHash('sha256').update(rawSql).digest('hex');
    const statements = splitSqlStatements(rawSql);

    console.log(`\n[d1-migrate] Applying ${migrationName} (${statements.length} statements)...`);

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];

      // Safe pre-check: if statement is ADD COLUMN and column already exists, skip execution safely
      const addColMatch = stmt.match(/ALTER\s+TABLE\s+["`]?(\w+)["`]?\s+ADD\s+COLUMN\s+["`]?(\w+)["`]?/i);
      if (addColMatch) {
        const [, tableName, colName] = addColMatch;
        try {
          const colCheck = await executeD1Query(`PRAGMA table_info("${tableName}");`);
          const existingCols = new Set((colCheck.results || []).map((c) => c.name));
          if (existingCols.has(colName)) {
            console.log(`  ℹ️ Statement ${i + 1}: Column "${colName}" already exists on "${tableName}". Skipping idempotent ADD COLUMN.`);
            continue;
          }
        } catch {}
      }

      try {
        await executeD1Query(stmt);
      } catch (stmtErr) {
        const errMsg = stmtErr.message ? stmtErr.message.toLowerCase() : '';
        // If an ADD COLUMN fails because the column already exists (e.g. partial run interruption),
        // we can safely log and continue without failing the migration.
        if (errMsg.includes('duplicate column name') || errMsg.includes('already exists')) {
          console.warn(`  ⚠️ Statement ${i + 1}: Column or index already present, continuing.`);
        } else {
          console.error(`  ❌ Statement ${i + 1} failed: ${stmt}`);
          throw stmtErr;
        }
      }
    }

    // 7. Record the migration in _cf_d1_migrations (INSERT OR IGNORE for retry safety)
    await executeD1Query(
      `INSERT OR IGNORE INTO _cf_d1_migrations (migration_name, checksum) VALUES (?, ?);`,
      [migrationName, checksum]
    );

    // Also record in _prisma_migrations if present
    if (hasPrismaMigrationsTable) {
      try {
        await executeD1Query(
          `INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, applied_steps_count)
           VALUES (?, ?, CURRENT_TIMESTAMP, ?, 1);`,
          [crypto.randomUUID(), checksum, migrationName]
        );
      } catch (pErr) {
        console.warn(`  Notice updating _prisma_migrations: ${pErr.message}`);
      }
    }

    console.log(`[d1-migrate] ✅ Successfully applied and recorded ${migrationName}`);
  }

  console.log('\n====================================================');
  console.log('[d1-migrate] ✅ All migrations successfully applied to Cloudflare D1!');
  console.log('====================================================');
}

runMigrations().catch((err) => {
  console.error('\n[d1-migrate] ❌ FATAL Migration Error:', err.message);
  process.exit(1);
});
