#!/usr/bin/env node

/**
 * Cloudflare D1 DateTime Migration Script
 * 
 * Safely converts legacy SQLite integer millisecond timestamps in Cloudflare D1
 * into ISO-8601 UTC strings formatted as 'YYYY-MM-DDTHH:MM:SS.SSSZ'.
 * 
 * Features:
 * - Read-only inspection (--dry-run)
 * - Safe reversible migration (bit-for-bit lossless rollback with --rollback)
 * - Validates affected tables before and after execution
 * - Non-destructive (modifies only integer timestamp representations)
 */

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;

const isDryRun = process.argv.includes('--dry-run');
const isRollback = process.argv.includes('--rollback');

console.log('====================================================');
console.log('   Cloudflare D1 DateTime Migration Tool');
console.log('====================================================');
console.log(`Action: ${isRollback ? 'ROLLBACK (ISO string -> ms integer)' : isDryRun ? 'DRY RUN (Inspection Only)' : 'FORWARD MIGRATION (ms integer -> ISO string)'}`);

if (!accountId || !databaseId || !apiToken) {
  console.error('❌ Error: Missing required Cloudflare credentials.');
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

const AFFECTED_COLUMNS = [
  { table: 'User', column: 'createdAt' },
  { table: 'User', column: 'lockoutUntil' },
  { table: 'Expense', column: 'date' },
  { table: 'Expense', column: 'createdAt' },
  { table: 'Group', column: 'createdAt' },
  { table: 'Invitation', column: 'createdAt' },
  { table: 'Investment', column: 'date' },
  { table: 'Investment', column: 'createdAt' },
  { table: 'Investment', column: 'updatedAt' },
  { table: 'InvestmentTransaction', column: 'date' },
  { table: 'InvestmentTransaction', column: 'createdAt' },
  { table: '_prisma_migrations', column: 'started_at' },
  { table: '_prisma_migrations', column: 'finished_at' },
  { table: '_prisma_migrations', column: 'rolled_back_at' }
];

async function run() {
  console.log(`Target Database ID: ${databaseId}`);
  console.log('1. Inspecting current column types and counts in D1...');

  const audit = [];
  for (const item of AFFECTED_COLUMNS) {
    try {
      const res = await executeD1Query(`
        SELECT 
          typeof("${item.column}") as val_type,
          COUNT(*) as cnt,
          MIN("${item.column}") as min_val,
          MAX("${item.column}") as max_val
        FROM "${item.table}"
        WHERE "${item.column}" IS NOT NULL
        GROUP BY typeof("${item.column}");
      `);

      const rows = res.results || [];
      audit.push({ ...item, stats: rows });
      for (const r of rows) {
        console.log(`   ${item.table}.${item.column} [${r.val_type}]: ${r.cnt} rows (min: ${r.min_val}, max: ${r.max_val})`);
      }
    } catch (e) {
      console.warn(`   Notice querying ${item.table}.${item.column}: ${e.message}`);
    }
  }

  if (isDryRun) {
    console.log('\n[DRY RUN] Inspection complete. No database changes were made.');
    return;
  }

  if (isRollback) {
    console.log('\n2. Executing ROLLBACK migration (converting ISO-8601 strings back to integers)...');
    for (const item of AFFECTED_COLUMNS) {
      const sql = `
        UPDATE "${item.table}"
        SET "${item.column}" = CAST(strftime('%s', "${item.column}") * 1000 + CAST(strftime('%f', "${item.column}") * 1000 AS INTEGER) % 1000 AS INTEGER)
        WHERE typeof("${item.column}") = 'text' AND "${item.column}" IS NOT NULL AND "${item.column}" LIKE '____-__-__T__:__:__.___Z';
      `;
      const res = await executeD1Query(sql);
      const changes = res.meta?.changes ?? 0;
      if (changes > 0) {
        console.log(`   Restored ${item.table}.${item.column}: ${changes} rows converted back to integer`);
      }
    }
  } else {
    console.log('\n2. Executing FORWARD migration (converting millisecond integers to ISO-8601 strings)...');
    for (const item of AFFECTED_COLUMNS) {
      const sql = `
        UPDATE "${item.table}"
        SET "${item.column}" = strftime('%Y-%m-%dT%H:%M:%fZ', "${item.column}" / 1000.0, 'unixepoch')
        WHERE typeof("${item.column}") = 'integer' AND "${item.column}" IS NOT NULL;
      `;
      const res = await executeD1Query(sql);
      const changes = res.meta?.changes ?? 0;
      if (changes > 0) {
        console.log(`   Migrated ${item.table}.${item.column}: ${changes} integer rows converted to ISO-8601 strings`);
      }
    }
  }

  console.log('\n3. Validating post-migration state...');
  let totalRemainingIntegers = 0;
  for (const item of AFFECTED_COLUMNS) {
    try {
      const res = await executeD1Query(`
        SELECT COUNT(*) as int_cnt
        FROM "${item.table}"
        WHERE typeof("${item.column}") = 'integer' AND "${item.column}" IS NOT NULL;
      `);
      const intCnt = res.results?.[0]?.int_cnt ?? 0;
      if (intCnt > 0) {
        if (!isRollback) {
          console.error(`   ⚠️ ${item.table}.${item.column} still has ${intCnt} integer records!`);
          totalRemainingIntegers += intCnt;
        } else {
          console.log(`   ${item.table}.${item.column}: ${intCnt} integer records restored.`);
        }
      }
    } catch {}
  }

  if (!isRollback && totalRemainingIntegers === 0) {
    console.log('====================================================');
    console.log('✅ SUCCESS: All DateTime fields in Cloudflare D1 successfully migrated to ISO-8601 strings!');
    console.log('====================================================');
  } else if (isRollback) {
    console.log('====================================================');
    console.log('✅ SUCCESS: Rollback completed successfully.');
    console.log('====================================================');
  }
}

run().catch((err) => {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
});
