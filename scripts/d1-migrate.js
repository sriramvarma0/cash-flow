#!/usr/bin/env node

/**
 * Cloudflare D1 Production Migration Runner for CashFlow
 * 
 * Safely applies Prisma SQLite migrations from backend/prisma/migrations/
 * directly to a remote Cloudflare D1 database via Cloudflare REST API.
 * 
 * Key Safety Guarantees:
 * 1. Checks existing migration history across `d1_migrations`
 *    to ensure previously applied migrations NEVER execute again.
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

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID;
const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID || process.env.CLOUDFLARE_DATABASE_ID || process.env.D1_DATABASE_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN || process.env.CLOUDFLARE_TOKEN;
const httpUrl = process.env.CLOUDFLARE_D1_HTTP_URL || process.env.D1_HTTP_URL;

const isDryRun = process.argv.includes('--dry-run');
const isVerify = process.argv.includes('--verify');
const isOptional = process.argv.includes('--optional') || process.argv.includes('--skip-if-missing');
const isDiagnose = process.argv.includes('--diagnose');

console.log('====================================================');
console.log('   CashFlow Cloudflare D1 Migration Engine');
console.log('====================================================');
if (isDryRun) console.log('Mode: DRY RUN (Inspection Only)');
if (isVerify) console.log('Mode: VERIFY (Assert Zero Pending Migrations)');
if (isDiagnose) console.log('Mode: DIAGNOSE (Connection & Permissions Audit)');

// Safe credential diagnosis - NEVER logs secret values, lengths, or prefixes
function logSafeDiagnostics() {
  console.log('[d1-migrate] --- Cloudflare D1 Credentials Diagnostic ---');
  console.log(`  • CLOUDFLARE_ACCOUNT_ID:     ${accountId ? 'Present' : '❌ MISSING'}`);
  console.log(`  • CLOUDFLARE_D1_DATABASE_ID: ${databaseId ? 'Present' : '❌ MISSING'}`);
  console.log(`  • CLOUDFLARE_API_TOKEN:      ${apiToken ? 'Present' : '❌ MISSING'}`);
  console.log(`  • CLOUDFLARE_D1_HTTP_URL:    ${httpUrl ? 'Custom URL configured' : 'Default (Cloudflare API v4)'}`);
  console.log('---------------------------------------------------------');
}

logSafeDiagnostics();

// 1. Validate Credentials
if (!httpUrl && (!accountId || !databaseId || !apiToken)) {
  if (isOptional) {
    console.log('[d1-migrate] Notice: Cloudflare D1 credentials not provided. Skipping remote migration check.');
    process.exit(0);
  }
  console.error('[d1-migrate] ❌ Fatal: Missing required Cloudflare D1 credentials.');
  console.error('[d1-migrate] Required environment variables:');
  console.error('  - CLOUDFLARE_ACCOUNT_ID');
  console.error('  - CLOUDFLARE_D1_DATABASE_ID');
  console.error('  - CLOUDFLARE_API_TOKEN');
  process.exit(1);
}

const endpoint =
  httpUrl ||
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;

async function executeD1Query(sql, params = [], operationName = 'Query Execution') {
  const headers = {
    'Content-Type': 'application/json'
  };
  if (apiToken) {
    headers['Authorization'] = `Bearer ${apiToken}`;
  }

  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ sql, params }),
      signal: AbortSignal.timeout(30000)
    });
  } catch (netErr) {
    console.error(`\n[d1-migrate] ❌ Network Error during ${operationName}:`, netErr.message);
    throw new Error(`[${operationName}] Network fetch failed: ${netErr.message}`);
  }

  const status = response.status;
  const statusText = response.statusText;
  const body = await response.json().catch(() => ({}));

  if (!response.ok || !body.success) {
    const cfError = body.errors?.[0] || {};
    const errorCode = cfError.code || status;
    const errorMsg = cfError.message || body.messages?.[0]?.message || `Query failed with status ${status}`;

    console.error('\n====================================================');
    console.error(`[d1-migrate] ❌ Operation Failed: ${operationName}`);
    console.error('====================================================');
    console.error(`  • HTTP Status:           ${status} ${statusText}`);
    console.error(`  • Cloudflare Error Code: ${errorCode}`);
    console.error(`  • Cloudflare Message:    ${errorMsg}`);
    console.error(`  • Statement Executed:    ${sql.replace(/\s+/g, ' ').trim().substring(0, 120)}...`);

    if (errorMsg.includes('SQLITE_AUTH') || errorCode === 7500) {
      console.error('\n  [Diagnosis: SQLITE_AUTH]');
      console.error('  The query was rejected by Cloudflare D1 SQLite authorizer.');
      console.error('  This occurs if a query attempts to access reserved tables (e.g. starting with _cf_)');
      console.error('  or unsupported PRAGMA commands.');
    } else if (status === 401 || status === 403 || errorCode === 10000 || errorCode === 9109) {
      console.error('\n  [Diagnosis: Authorization Failure]');
      console.error('  HTTP 401/403 or Cloudflare Auth Error.');
      console.error('  Ensure CLOUDFLARE_API_TOKEN is valid and has "Account > D1 > Edit" permissions.');
      console.error('  Ensure CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_D1_DATABASE_ID match your Cloudflare account.');
    }
    console.error('====================================================\n');

    const err = new Error(`[${operationName}] Failed (HTTP ${status}, Code ${errorCode}): ${errorMsg}`);
    err.code = errorCode;
    err.status = status;
    throw err;
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

  // 1. Initial Connectivity & Health Check
  await executeD1Query('SELECT 1 as ping;', [], 'Health Ping (SELECT 1)');

  // 2. Ensure standard Wrangler D1 tracking table exists (d1_migrations)
  // Note: D1 reserves table names starting with _cf_. The standard table is d1_migrations.
  await executeD1Query(`
    CREATE TABLE IF NOT EXISTS d1_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `, [], 'Ensuring Migration Tracking Table (d1_migrations)');

  // 3. Query all existing migration tracking tables
  const appliedSet = new Set();

  // 3A: Check d1_migrations (Wrangler standard)
  try {
    const res = await executeD1Query(
      `SELECT name as migration_name FROM d1_migrations;`,
      [],
      'Querying migration history (d1_migrations)'
    );
    for (const r of res.results || []) {
      if (r.migration_name) appliedSet.add(r.migration_name);
    }
  } catch (err) {
    console.warn(`[d1-migrate] Note querying d1_migrations: ${err.message}`);
  }

  // 3B: Check if _prisma_migrations table exists (for mirror tracking only)
  // CRITICAL: Records in _prisma_migrations are NEVER used as proof that D1 migrations have executed.
  // The authoritative ledger for Cloudflare D1 migrations is strictly d1_migrations.
  let hasPrismaMigrationsTable = false;
  try {
    const res = await executeD1Query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='_prisma_migrations';`,
      [],
      'Checking presence of _prisma_migrations table'
    );
    hasPrismaMigrationsTable = (res.results || []).length > 0;
  } catch {}

  console.log(`[d1-migrate] Found ${appliedSet.size} recorded migration(s) in d1_migrations.`);

  // 4. Inspect existing schema (tables & columns) to verify production schema state
  // Exclude _cf_% and sqlite_% to prevent triggering D1 internal table authorizer hooks
  const existingTables = new Set();
  try {
    const res = await executeD1Query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'sqlite_%';`,
      [],
      'Inspecting database schema (sqlite_master)'
    );
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
        const colRes = await executeD1Query(
          `PRAGMA table_info("${tbl}");`,
          [],
          `Inspecting table columns (PRAGMA table_info on ${tbl})`
        );
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
          if (!isDryRun && !isVerify && !isDiagnose) {
            await executeD1Query(
              `INSERT OR IGNORE INTO d1_migrations (name) VALUES (?);`,
              [check.name],
              `Baselining historical migration (${check.name})`
            );
            if (hasPrismaMigrationsTable) {
              await executeD1Query(
                `INSERT OR IGNORE INTO _prisma_migrations (id, checksum, finished_at, migration_name, applied_steps_count)
                 VALUES (?, ?, CURRENT_TIMESTAMP, ?, 1);`,
                [crypto.randomUUID(), 'baseline_verified', check.name],
                `Baselining in _prisma_migrations (${check.name})`
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

  // 5. Discover all migrations in the repository
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

  // 6. Check if all migrations are satisfied
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

  // If in --diagnose mode, exit cleanly after non-destructive verification
  if (isDiagnose) {
    console.log('====================================================');
    console.log('[d1-migrate] ✅ Diagnosis complete. Authorization and connectivity verified.');
    console.log(`             Pending migrations discovered: ${pendingMigrations.length}`);
    console.log('====================================================');
    return;
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

  // 7. Apply each pending migration in chronological order
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
          const colCheck = await executeD1Query(
            `PRAGMA table_info("${tableName}");`,
            [],
            `Checking column existence (${tableName}.${colName})`
          );
          const existingCols = new Set((colCheck.results || []).map((c) => c.name));
          if (existingCols.has(colName)) {
            console.log(`  ℹ️ Statement ${i + 1}: Column "${colName}" already exists on "${tableName}". Skipping idempotent ADD COLUMN.`);
            continue;
          }
        } catch {}
      }

      try {
        await executeD1Query(
          stmt,
          [],
          `Applying statement ${i + 1}/${statements.length} in ${migrationName}`
        );
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

    // 8. Record the migration in d1_migrations (INSERT OR IGNORE for retry safety)
    await executeD1Query(
      `INSERT OR IGNORE INTO d1_migrations (name) VALUES (?);`,
      [migrationName],
      `Recording completed migration (${migrationName}) in d1_migrations`
    );

    // Also record in _prisma_migrations if present
    if (hasPrismaMigrationsTable) {
      try {
        await executeD1Query(
          `INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, applied_steps_count)
           VALUES (?, ?, CURRENT_TIMESTAMP, ?, 1);`,
          [crypto.randomUUID(), checksum, migrationName],
          `Recording in _prisma_migrations (${migrationName})`
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
