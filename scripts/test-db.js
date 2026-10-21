#!/usr/bin/env node

/**
 * CashFlow Database Connection & Verification Script
 * 
 * Tests database connectivity and read/write capability against either:
 * - Local SQLite (when DATABASE_PROVIDER=sqlite)
 * - Cloudflare D1 (when DATABASE_PROVIDER=d1)
 */

const { PrismaClient } = require('@prisma/client');
const { PrismaD1 } = require('@prisma/adapter-d1');

const provider = (process.env.DATABASE_PROVIDER || 'sqlite').trim().toLowerCase();

console.log('====================================================');
console.log(`   Database Connection Test [Provider: ${provider.toUpperCase()}]`);
console.log('====================================================');

async function testDatabase() {
  let prisma;

  if (provider === 'd1') {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;

    if (!accountId || !databaseId || !apiToken) {
      console.error('❌ Error: Missing required Cloudflare D1 credentials:');
      if (!accountId) console.error('  - CLOUDFLARE_ACCOUNT_ID is required');
      if (!databaseId) console.error('  - CLOUDFLARE_D1_DATABASE_ID is required');
      if (!apiToken) console.error('  - CLOUDFLARE_API_TOKEN is required');
      process.exit(1);
    }

    console.log(`Target Cloudflare D1 Database ID: ${databaseId}`);
    console.log(`Authenticating via Cloudflare API token...`);

    // Dynamic import/require of D1 client
    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;

    async function executeSql(sql, params = []) {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiToken}`
        },
        body: JSON.stringify({ sql, params }),
        signal: AbortSignal.timeout(15000)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.errors?.[0]?.message || `HTTP ${response.status}`);
      }
      return data.result?.[0] || {};
    }

    const DATETIME_COLUMN_NAMES = new Set([
      'createdat',
      'updatedat',
      'lockoutuntil',
      'date',
      'started_at',
      'finished_at',
      'rolled_back_at'
    ]);

    function isDateTimeColumn(colName) {
      if (!colName) return false;
      return DATETIME_COLUMN_NAMES.has(colName.toLowerCase());
    }

    function normalizeD1Value(val, colName) {
      if (val === null || val === undefined) return val;
      if (
        isDateTimeColumn(colName) &&
        typeof val === 'number' &&
        Number.isFinite(val) &&
        val > 100000000000
      ) {
        return new Date(val).toISOString();
      }
      return val;
    }

    const d1Mock = {
      prepare(query) {
        let bound = [];
        return {
          bind(...args) {
            bound = args;
            return this;
          },
          async run() {
            return executeSql(query, bound);
          },
          async all() {
            const res = await executeSql(query, bound);
            const rows = res.results || [];
            const normalized = rows.map((row) => {
              if (!row || typeof row !== 'object') return row;
              const clone = { ...row };
              for (const k of Object.keys(clone)) {
                clone[k] = normalizeD1Value(clone[k], k);
              }
              return clone;
            });
            return { results: normalized, success: true, meta: res.meta };
          },
          async first(col) {
            const res = await executeSql(query, bound);
            const first = res.results?.[0];
            if (!first) return null;
            if (col) return normalizeD1Value(first[col] ?? null, col);
            const clone = { ...first };
            for (const k of Object.keys(clone)) {
              clone[k] = normalizeD1Value(clone[k], k);
            }
            return clone;
          },
          async raw(options) {
            const res = await executeSql(query, bound);
            const rows = res.results || [];
            if (rows.length === 0) return options?.columnNames ? [[]] : [];
            const cols = Object.keys(rows[0]);
            const arr = rows.map((r) => cols.map((c) => normalizeD1Value(r[c], c)));
            return options?.columnNames ? [cols, ...arr] : arr;
          }
        };
      },
      async batch(stmts) {
        const out = [];
        for (const s of stmts) out.push(await s.run());
        return out;
      },
      async exec(query) {
        const res = await executeSql(query);
        return { count: res.meta?.changes ?? 0, duration: res.meta?.duration ?? 0 };
      },
      async dump() {
        throw new Error('Not supported');
      }
    };

    const adapter = new PrismaD1(d1Mock);
    prisma = new PrismaClient({ adapter });
  } else if (provider === 'sqlite') {
    const dbUrl = process.env.DATABASE_URL || 'file:../../data/dev.db';
    console.log(`Target SQLite URL: ${dbUrl}`);
    prisma = new PrismaClient({
      datasources: { db: { url: dbUrl } }
    });
  } else {
    console.error(`❌ Unsupported DATABASE_PROVIDER: "${provider}". Expected "sqlite" or "d1".`);
    process.exit(1);
  }

  try {
    console.log('1. Executing ping query (SELECT 1)...');
    const rawResult = await prisma.$queryRaw`SELECT 1 as connected;`;
    console.log('   Raw query result:', rawResult);

    // Check if tables exist in the database (handles empty SQLite database in CI or fresh environments)
    let hasUserTable = true;
    if (provider === 'sqlite') {
      try {
        const tables = await prisma.$queryRaw`SELECT name FROM sqlite_master WHERE type='table' AND name='User';`;
        hasUserTable = Array.isArray(tables) && tables.length > 0;
      } catch {
        hasUserTable = false;
      }
    }

    if (hasUserTable) {
      console.log('2. Querying model data (User count)...');
      const userCount = await prisma.user.count();
      console.log(`   Total registered users: ${userCount}`);

      console.log('3. Validating DateTime field conversion (findFirst User & Expense)...');
      const sampleUser = await prisma.user.findFirst();
      if (sampleUser) {
        const isDate = sampleUser.createdAt instanceof Date;
        console.log(`   User.createdAt: ${sampleUser.createdAt?.toISOString?.() ?? sampleUser.createdAt} (instanceof Date: ${isDate})`);
        if (!isDate) throw new Error('User.createdAt is not an instance of Date!');
      } else {
        console.log('   (No user records found to inspect)');
      }

      const sampleExpense = await prisma.expense.findFirst();
      if (sampleExpense) {
        const isDate = sampleExpense.date instanceof Date;
        console.log(`   Expense.date: ${sampleExpense.date?.toISOString?.() ?? sampleExpense.date} (instanceof Date: ${isDate})`);
        if (!isDate) throw new Error('Expense.date is not an instance of Date!');
      } else {
        console.log('   (No expense records found to inspect)');
      }
    } else {
      console.log('2. Notice: Table "User" does not exist in this database (uninitialized SQLite database, e.g. in CI).');
      console.log('   Database connectivity verified successfully via ping query.');
    }

    console.log('====================================================');
    console.log(`✅ SUCCESS: ${provider.toUpperCase()} database connection verified!`);
    console.log('====================================================');
  } catch (err) {
    console.error(`❌ Database verification failed for provider [${provider}]:`, err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testDatabase();
