#!/usr/bin/env node

/**
 * Cloudflare D1 Migration Test Suite
 * 
 * Verifies all requirements of the D1 Migration Engine:
 * 1. Safe baseline establishment when existing production tables exist.
 * 2. Never reruns previously applied migrations or drops existing tables.
 * 3. Applies only pending migrations in chronological order.
 * 4. Idempotency: second run detects zero pending migrations and makes no changes.
 * 5. Data integrity: existing rows in User, Expense, etc. are 100% preserved.
 * 6. Dynamic migration: adds a test migration, verifies it is applied exactly once,
 *    and confirms subsequent runs skip it.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const http = require('http');

console.log('================================================================');
console.log('  CashFlow Cloudflare D1 Migration Verification Suite');
console.log('================================================================\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition, testName) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    throw new Error(`Assertion failed: ${testName}`);
  }
}

// In-memory / temporary database simulation using a mock D1 HTTP REST API server
// We use a small python SQLite runner or child process to execute SQL against a temp db file.
const tempDbFile = path.resolve(__dirname, '../data/test_d1_sim.db');

function runSqlOnTempDb(sql, params = []) {
  fs.mkdirSync(path.dirname(tempDbFile), { recursive: true });
  // Safe execution of SQL against tempDbFile via python's built-in sqlite3
  const script = `
import sqlite3, json, sys
conn = sqlite3.connect(sys.argv[1])
conn.row_factory = sqlite3.Row
cur = conn.cursor()
sql = sys.argv[2].strip()
params = json.loads(sys.argv[3]) if len(sys.argv) > 3 else []
try:
    statements = [s.strip() for s in sql.split(';') if s.strip()]
    rows = []
    if len(statements) > 1 and not params:
        cur.executescript(sql)
    else:
        # Single statement or parameterized query
        cur.execute(sql, params)
        if cur.description:
            rows = [dict(r) for r in cur.fetchall()]
    conn.commit()
    print(json.dumps({"success": True, "results": rows, "changes": conn.total_changes}))
except Exception as e:
    print(json.dumps({"success": False, "error": str(e)}))
`;

  const res = spawnSync('python', ['-c', script, tempDbFile, sql, JSON.stringify(params)], {
    encoding: 'utf8'
  });

  if (res.error) throw res.error;
  try {
    return JSON.parse(res.stdout.trim());
  } catch (err) {
    return { success: false, error: res.stderr || res.stdout };
  }
}

async function startMockD1Server(port = 8787) {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const sql = payload.sql || '';
        const params = payload.params || [];

        const dbRes = runSqlOnTempDb(sql, params);
        if (!dbRes.success) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            errors: [{ message: dbRes.error }]
          }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          result: [{
            success: true,
            meta: { changes: dbRes.changes || 0 },
            results: dbRes.results || []
          }]
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, errors: [{ message: err.message }] }));
      }
    });
  });

  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  return {
    server,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

function runMigrationProcess(args = [], env = {}) {
  const { spawn } = require('child_process');
  return new Promise((resolve) => {
    const cp = spawn('node', ['scripts/d1-migrate.js', ...args], {
      env: { ...process.env, ...env },
      cwd: path.resolve(__dirname, '..')
    });
    let stdout = '';
    let stderr = '';
    cp.stdout.on('data', (d) => { stdout += d.toString(); });
    cp.stderr.on('data', (d) => { stderr += d.toString(); });
    cp.on('close', (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}

async function main() {
  if (fs.existsSync(tempDbFile)) {
    fs.unlinkSync(tempDbFile);
  }

  // 1. Seed simulated existing production database state:
  // - Tables exist: User, Expense, Group, Tag, Investment (WITHOUT paymentAccount, isReceivable)
  // - Real user records and expense records exist (live data)
  // - NO _cf_d1_migrations table exists initially (simulating pre-migration production state)
  console.log('[Test Setup] Initializing simulated production D1 database with live records...');
  runSqlOnTempDb(`
    CREATE TABLE "User" (
      "id" TEXT PRIMARY KEY,
      "name" TEXT NOT NULL,
      "email" TEXT UNIQUE NOT NULL,
      "phoneNumber" TEXT NOT NULL,
      "passwordHash" TEXT NOT NULL,
      "twoFactorEnabled" BOOLEAN DEFAULT 0,
      "twoFactorSecret" TEXT,
      "twoFactorTempSecret" TEXT,
      "twoFactorRecoveryCodes" TEXT,
      "failedLoginAttempts" INTEGER DEFAULT 0,
      "lockoutUntil" DATETIME,
      "createdAt" DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE "Expense" (
      "id" TEXT PRIMARY KEY,
      "amount" REAL NOT NULL,
      "category" TEXT,
      "description" TEXT,
      "paymentMethod" TEXT DEFAULT 'Card',
      "date" DATETIME NOT NULL,
      "createdAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
      "userId" TEXT NOT NULL,
      "transactionType" TEXT DEFAULT 'EXPENSE',
      "toUserId" TEXT,
      "categoryType" TEXT
    );

    CREATE TABLE "Group" (
      "id" TEXT PRIMARY KEY,
      "name" TEXT NOT NULL,
      "createdById" TEXT NOT NULL,
      "createdAt" DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE "Invitation" (
      "id" TEXT PRIMARY KEY,
      "token" TEXT NOT NULL,
      "status" TEXT DEFAULT 'PENDING',
      "expiresAt" DATETIME NOT NULL,
      "createdAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
      "groupId" TEXT NOT NULL,
      "invitedBy" TEXT NOT NULL
    );

    CREATE TABLE "Tag" (
      "id" TEXT PRIMARY KEY,
      "name" TEXT NOT NULL,
      "userId" TEXT NOT NULL
    );

    CREATE TABLE "Investment" (
      "id" TEXT PRIMARY KEY,
      "name" TEXT NOT NULL,
      "code" TEXT,
      "amount" REAL NOT NULL,
      "investedAmount" REAL,
      "type" TEXT NOT NULL,
      "date" DATETIME,
      "userId" TEXT NOT NULL,
      "createdAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO "User" (id, name, email, phoneNumber, passwordHash)
    VALUES ('u1', 'Sriram Varma', 'sriram@example.com', '+919999999999', 'hash123');

    INSERT INTO "Expense" (id, amount, category, description, paymentMethod, date, userId)
    VALUES ('exp_100', 450.0, 'Groceries', 'Supermarket visit', 'Card', '2026-10-25T10:00:00.000Z', 'u1');
  `);

  const mockD1 = await startMockD1Server(8787);

  const testEnv = {
    ...process.env,
    CLOUDFLARE_D1_HTTP_URL: 'http://127.0.0.1:8787/query',
    CLOUDFLARE_ACCOUNT_ID: 'test-account',
    CLOUDFLARE_D1_DATABASE_ID: 'test-db',
    CLOUDFLARE_API_TOKEN: 'test-token'
  };

  try {
    // ------------------------------------------------------------------
    // TEST 1: Baseline Establishment & Safe Application
    // ------------------------------------------------------------------
    console.log('\n[Test 1] Executing d1-migrate on existing production database...');
    const run1 = await runMigrationProcess([], testEnv);

    console.log(run1.stdout);
    if (run1.status !== 0) {
      console.error(run1.stderr);
    }
    assert(run1.status === 0, 'Test 1: d1-migrate process exited with code 0');
    assert(run1.stdout.includes('Baseline Established & Verified'), 'Test 1: Correctly established migration baseline verifying against actual schema');
    assert(run1.stdout.includes('20261031000000_add_payment_account_and_receivables'), 'Test 1: Applied pending migration 20261031000000_add_payment_account_and_receivables');

    // Verify existing data was untouched
    const checkUser = runSqlOnTempDb(`SELECT * FROM "User" WHERE id='u1'`);
    assert(checkUser.results?.length === 1 && checkUser.results[0].email === 'sriram@example.com', 'Test 1: Existing User records remain completely intact');

    const checkExpense = runSqlOnTempDb(`SELECT * FROM "Expense" WHERE id='exp_100'`);
    assert(checkExpense.results?.length === 1 && checkExpense.results[0].amount === 450.0, 'Test 1: Existing Expense records remain completely intact');

    // Verify new columns exist on Expense
    const checkCols = runSqlOnTempDb(`SELECT * FROM pragma_table_info('Expense') WHERE name IN ('paymentAccount', 'isReceivable', 'receivableStatus', 'reimbursedAmount')`);
    assert(checkCols.results?.length === 4, 'Test 1: All 4 new columns added to Expense table');

    // ------------------------------------------------------------------
    // TEST 2: Idempotency & Verification (--verify)
    // ------------------------------------------------------------------
    console.log('\n[Test 2] Running d1-migrate --verify on already-migrated database...');
    const run2 = await runMigrationProcess(['--verify'], testEnv);

    console.log(run2.stdout);
    assert(run2.status === 0, 'Test 2: --verify passed with code 0 (zero pending migrations)');
    assert(run2.stdout.includes('Zero pending migrations'), 'Test 2: Accurately verified zero pending migrations');

    // ------------------------------------------------------------------
    // TEST 3: Dynamic Test Migration (Apply Once & Never Rerun)
    // ------------------------------------------------------------------
    console.log('\n[Test 3] Creating a temporary new migration to verify apply-once semantics...');
    const testMigDir = path.resolve(__dirname, '../backend/prisma/migrations/20261031999999_test_verify_apply_once');
    fs.mkdirSync(testMigDir, { recursive: true });
    fs.writeFileSync(
      path.join(testMigDir, 'migration.sql'),
      `CREATE TABLE IF NOT EXISTS "_test_migration_canary" (id TEXT PRIMARY KEY, note TEXT);`
    );

    try {
      // Step A: Should detect 1 pending migration and apply it
      console.log('Applying newly created test migration...');
      const run3A = await runMigrationProcess([], testEnv);
      assert(run3A.status === 0, 'Test 3A: Applied new migration with exit code 0');
      assert(run3A.stdout.includes('20261031999999_test_verify_apply_once'), 'Test 3A: Applied 20261031999999_test_verify_apply_once');

      const checkCanary = runSqlOnTempDb(`SELECT name FROM sqlite_master WHERE type='table' AND name='_test_migration_canary'`);
      assert(checkCanary.results?.length === 1, 'Test 3A: Canary table was created in database');

      // Step B: Subsequent run must skip it completely
      console.log('Verifying subsequent run skips the applied migration...');
      const run3B = await runMigrationProcess(['--verify'], testEnv);
      assert(run3B.status === 0, 'Test 3B: Subsequent run skips applied migration (0 pending)');
      assert(run3B.stdout.includes('Zero pending migrations'), 'Test 3B: Confirmed 0 pending migrations');

    } finally {
      // Cleanup the temporary test migration folder
      fs.rmSync(testMigDir, { recursive: true, force: true });
      // Remove canary table from temp db
      runSqlOnTempDb(`DROP TABLE IF EXISTS "_test_migration_canary";`);
      runSqlOnTempDb(`DELETE FROM _cf_d1_migrations WHERE migration_name='20261031999999_test_verify_apply_once';`);
    }

    // ------------------------------------------------------------------
    // TEST 4: Partial Failure / Workflow Interruption & Restart Safety
    // ------------------------------------------------------------------
    console.log('\n[Test 4] Simulating partial interruption recovery (column pre-exists)...');
    const testInterruptedDir = path.resolve(__dirname, '../backend/prisma/migrations/20261031999998_test_interrupted_run');
    fs.mkdirSync(testInterruptedDir, { recursive: true });
    fs.writeFileSync(
      path.join(testInterruptedDir, 'migration.sql'),
      `ALTER TABLE "Expense" ADD COLUMN "testPartialCol" TEXT;\nCREATE INDEX IF NOT EXISTS "idx_test_partial" ON "Expense"("testPartialCol");`
    );

    try {
      // Manually add the column beforehand as if statement 1 ran before the runner was killed
      runSqlOnTempDb(`ALTER TABLE "Expense" ADD COLUMN "testPartialCol" TEXT;`);

      // Now run d1-migrate: it should detect the existing column, skip duplicate ADD COLUMN, execute remaining, and succeed
      const run4 = await runMigrationProcess([], testEnv);
      console.log(run4.stdout);
      assert(run4.status === 0, 'Test 4: Interrupted run recovered successfully with exit code 0');
      assert(run4.stdout.includes('already exists on "Expense". Skipping idempotent ADD COLUMN'), 'Test 4: Detected existing column and skipped duplicate statement');
      assert(run4.stdout.includes('Successfully applied and recorded 20261031999998_test_interrupted_run'), 'Test 4: Successfully completed interrupted migration');
    } finally {
      fs.rmSync(testInterruptedDir, { recursive: true, force: true });
      runSqlOnTempDb(`DROP INDEX IF EXISTS "idx_test_partial";`);
      runSqlOnTempDb(`DELETE FROM _cf_d1_migrations WHERE migration_name='20261031999998_test_interrupted_run';`);
    }

    // ------------------------------------------------------------------
    // TEST 5: Schema Inconsistency Detection (Halts Deployment)
    // ------------------------------------------------------------------
    console.log('\n[Test 5] Verifying schema inconsistency detection stops deployment...');
    // Drop one baseline table to simulate an inconsistent/corrupt schema
    runSqlOnTempDb(`DROP TABLE "Investment";`);
    runSqlOnTempDb(`DELETE FROM _cf_d1_migrations;`); // reset tracking to force baseline inspection

    const run5 = await runMigrationProcess([], testEnv);
    const output5 = run5.stdout + run5.stderr;
    assert(run5.status === 1, 'Test 5: Inconsistent schema halted deployment with exit code 1');
    assert(output5.includes('FATAL SCHEMA INCONSISTENCY DETECTED'), 'Test 5: Reported fatal schema inconsistency');

    console.log('\n================================================================');
    console.log(`  ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY! (100%)`);
    console.log('================================================================\n');

  } finally {
    await mockD1.close();
    if (fs.existsSync(tempDbFile)) {
      try { fs.unlinkSync(tempDbFile); } catch {}
    }
  }
}

main().catch((err) => {
  console.error('\nFATAL TEST FAILURE:', err);
  process.exit(1);
});
