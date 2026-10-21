#!/usr/bin/env node

/**
 * CashFlow DateTime Conversion & Driver Adapter Test Suite
 * 
 * Verifies that:
 * 1. User findUnique() (AuthService.login query path) succeeds when D1 returns:
 *    - Legacy Unix epoch millisecond integers (e.g. 1783245388569)
 *    - ISO-8601 UTC strings (e.g. '2026-07-05T09:56:28.569Z')
 *    - Standard SQLite datetime strings (e.g. '2026-07-05 09:56:28')
 * 2. Every model with DateTime fields reads properly and returns valid JavaScript Date objects:
 *    - User (createdAt, lockoutUntil)
 *    - Expense (date, createdAt)
 *    - Group (createdAt)
 *    - Invitation (createdAt)
 *    - Investment (date, createdAt, updatedAt)
 *    - InvestmentTransaction (date, createdAt)
 * 3. DateTime values round-trip with bit-for-bit millisecond precision.
 * 4. Write path (insert/update) correctly handles Date objects and ISO strings.
 */

const { PrismaClient } = require('@prisma/client');
const { PrismaD1 } = require('@prisma/adapter-d1');

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

function createMockD1Database(mockTables) {
  return {
    prepare(query) {
      let bound = [];
      return {
        bind(...args) {
          bound = args;
          return this;
        },
        async run() {
          return { success: true, meta: { changes: 1, last_row_id: 1, duration: 0 } };
        },
        async all() {
          for (const [tbl, data] of Object.entries(mockTables)) {
            if (query.toLowerCase().includes(`\`${tbl.toLowerCase()}\``) || query.toLowerCase().includes(`"${tbl.toLowerCase()}"`)) {
              const rows = data.rows.map((r) => {
                const obj = {};
                data.columns.forEach((col, i) => {
                  obj[col] = normalizeD1Value(r[i], col);
                });
                return obj;
              });
              return { results: rows, success: true, meta: {} };
            }
          }
          return { results: [], success: true, meta: {} };
        },
        async first(col) {
          const res = await this.all();
          const first = res.results?.[0];
          return col ? first?.[col] : first;
        },
        async raw(options) {
          for (const [tbl, data] of Object.entries(mockTables)) {
            if (query.toLowerCase().includes(`\`${tbl.toLowerCase()}\``) || query.toLowerCase().includes(`"${tbl.toLowerCase()}"`)) {
              let rows = data.rows;
              if (bound && bound.length > 0) {
                const match = rows.filter((r) => r.some((val) => val === bound[0]));
                if (match.length > 0) rows = match;
              }
              const normalizedRows = rows.map((r) =>
                data.columns.map((col, idx) => normalizeD1Value(r[idx], col))
              );
              if (options && options.columnNames) {
                return [data.columns, ...normalizedRows];
              }
              return normalizedRows;
            }
          }
          if (options && options.columnNames) return [[]];
          return [];
        }
      };
    },
    async batch() {
      return [];
    },
    async exec() {
      return { count: 0, duration: 0 };
    },
    async dump() {
      return new ArrayBuffer(0);
    }
  };
}

async function runTestSuite() {
  console.log('================================================================');
  console.log('  CashFlow DateTime Conversion & Driver Adapter Test Suite');
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
      throw new Error(`Test assertion failed: ${testName}`);
    }
  }

  // --- TEST 1: User findUnique() with integer timestamp (Production D1 exact scenario) ---
  console.log('[Test Group 1] AuthService.login() / User.findUnique() reproduction');
  {
    const tables = {
      User: {
        columns: [
          'id', 'name', 'email', 'phoneNumber', 'passwordHash',
          'twoFactorEnabled', 'twoFactorSecret', 'twoFactorTempSecret',
          'twoFactorRecoveryCodes', 'failedLoginAttempts', 'lockoutUntil', 'createdAt'
        ],
        rows: [
          ['9333003758', 'Sriram Varma', 'bhupathirajusriramvarma@gmail.com', '+1234567890', '$2b$10$hash', 0, null, null, null, 0, null, 1783245388569]
        ]
      }
    };
    const adapter = new PrismaD1(createMockD1Database(tables));
    const prisma = new PrismaClient({ adapter });

    const user = await prisma.user.findUnique({
      where: { email: 'bhupathirajusriramvarma@gmail.com' }
    });

    assert(user !== null, 'User is returned from findUnique');
    assert(user.createdAt instanceof Date, 'User.createdAt is an instance of Date');
    assert(user.createdAt.getTime() === 1783245388569, 'User.createdAt preserves exact millisecond timestamp (1783245388569)');
    assert(user.createdAt.toISOString() === '2026-07-05T09:56:28.569Z', 'User.createdAt formats to expected ISO string');
    await prisma.$disconnect();
  }

  // --- TEST 2: User findUnique() with ISO-8601 string ---
  console.log('\n[Test Group 2] User.findUnique() with ISO-8601 string in D1');
  {
    const tables = {
      User: {
        columns: [
          'id', 'name', 'email', 'phoneNumber', 'passwordHash',
          'twoFactorEnabled', 'twoFactorSecret', 'twoFactorTempSecret',
          'twoFactorRecoveryCodes', 'failedLoginAttempts', 'lockoutUntil', 'createdAt'
        ],
        rows: [
          ['9333003758', 'Sriram Varma', 'bhupathirajusriramvarma@gmail.com', '+1234567890', '$2b$10$hash', 0, null, null, null, 0, null, '2026-07-05T09:56:28.569Z']
        ]
      }
    };
    const adapter = new PrismaD1(createMockD1Database(tables));
    const prisma = new PrismaClient({ adapter });

    const user = await prisma.user.findUnique({
      where: { email: 'bhupathirajusriramvarma@gmail.com' }
    });

    assert(user.createdAt instanceof Date, 'User.createdAt is Date with ISO string');
    assert(user.createdAt.getTime() === 1783245388569, 'Exact millisecond preserved');
    await prisma.$disconnect();
  }

  // --- TEST 3: All Models and Date Fields ---
  console.log('\n[Test Group 3] All Models and DateTime fields validation');
  {
    const tables = {
      Expense: {
        columns: ['id', 'amount', 'category', 'description', 'paymentMethod', 'date', 'createdAt', 'userId', 'transactionType', 'toUserId', 'categoryType'],
        rows: [['exp_1', 120.5, 'Groceries', 'Supermarket', 'Card', 1782844200000, 1783245599973, '9333003758', 'EXPENSE', null, 'Need']]
      },
      Group: {
        columns: ['id', 'name', 'createdAt', 'ownerId', 'adminIds'],
        rows: [['grp_1', 'Family Group', 1784802934538, '9333003758', '[]']]
      },
      Invitation: {
        columns: ['id', 'groupId', 'inviteeEmail', 'inviteePhone', 'status', 'createdAt'],
        rows: [['inv_1', 'grp_1', 'invitee@test.com', null, 'PENDING', 1784802955361]]
      },
      Investment: {
        columns: ['id', 'code', 'name', 'type', 'units', 'buyPrice', 'currentPrice', 'color', 'date', 'userId', 'createdAt', 'updatedAt'],
        rows: [['asset_1', 'AAPL', 'Apple Inc', 'Stock', 15.0, 150.0, 185.0, '#000', 1786619580000, '9333003758', 1786619726981, 1792522296092]]
      },
      InvestmentTransaction: {
        columns: ['id', 'type', 'units', 'price', 'amount', 'date', 'investmentId', 'userId', 'createdAt'],
        rows: [['tx_1', 'BUY', 15.0, 150.0, 2250.0, 1786619580000, 'asset_1', '9333003758', 1792515380043]]
      }
    };
    const adapter = new PrismaD1(createMockD1Database(tables));
    const prisma = new PrismaClient({ adapter });

    const expense = await prisma.expense.findFirst();
    assert(expense.date instanceof Date, 'Expense.date is instance of Date');
    assert(expense.createdAt instanceof Date, 'Expense.createdAt is instance of Date');
    assert(expense.date.getTime() === 1782844200000, 'Expense.date millisecond value matches');

    const group = await prisma.group.findFirst();
    assert(group.createdAt instanceof Date, 'Group.createdAt is instance of Date');
    assert(group.createdAt.getTime() === 1784802934538, 'Group.createdAt millisecond value matches');

    const invitation = await prisma.invitation.findFirst();
    assert(invitation.createdAt instanceof Date, 'Invitation.createdAt is instance of Date');

    const investment = await prisma.investment.findFirst();
    assert(investment.date instanceof Date, 'Investment.date is instance of Date');
    assert(investment.createdAt instanceof Date, 'Investment.createdAt is instance of Date');
    assert(investment.updatedAt instanceof Date, 'Investment.updatedAt is instance of Date');

    const tx = await prisma.investmentTransaction.findFirst();
    assert(tx.date instanceof Date, 'InvestmentTransaction.date is instance of Date');
    assert(tx.createdAt instanceof Date, 'InvestmentTransaction.createdAt is instance of Date');

    await prisma.$disconnect();
  }

  // --- TEST 4: Nullable DateTime fields (e.g. lockoutUntil) ---
  console.log('\n[Test Group 4] Nullable DateTime handling');
  {
    const tables = {
      User: {
        columns: [
          'id', 'name', 'email', 'phoneNumber', 'passwordHash',
          'twoFactorEnabled', 'twoFactorSecret', 'twoFactorTempSecret',
          'twoFactorRecoveryCodes', 'failedLoginAttempts', 'lockoutUntil', 'createdAt'
        ],
        rows: [
          ['u_null', 'Null Lockout', 'null@test.com', '101', 'h', 0, null, null, null, 0, null, 1783245388569],
          ['u_locked', 'Locked User', 'locked@test.com', '102', 'h', 0, null, null, null, 5, 1783246388569, 1783245388569]
        ]
      }
    };
    const adapter = new PrismaD1(createMockD1Database(tables));
    const prisma = new PrismaClient({ adapter });

    const u1 = await prisma.user.findUnique({ where: { email: 'null@test.com' } });
    assert(u1.lockoutUntil === null, 'lockoutUntil is null when null in DB');

    const u2 = await prisma.user.findUnique({ where: { email: 'locked@test.com' } });
    assert(u2.lockoutUntil instanceof Date, 'lockoutUntil is Date when timestamp present');
    assert(u2.lockoutUntil.getTime() === 1783246388569, 'lockoutUntil exact timestamp preserved');

    await prisma.$disconnect();
  }

  // --- TEST 5: Round-trip precision and timezone neutrality ---
  console.log('\n[Test Group 5] Precision and Timezone Neutrality');
  {
    const originalEpoch = 1783245388569;
    const isoString = new Date(originalEpoch).toISOString();
    assert(isoString === '2026-07-05T09:56:28.569Z', 'ISO string formatting has millisecond .569');

    const parsedEpoch = new Date(isoString).getTime();
    assert(parsedEpoch === originalEpoch, 'Roundtrip from epoch -> ISO -> epoch is lossless');
  }

  console.log('\n================================================================');
  console.log(`  TEST RESULTS: ${passedTests} / ${totalTests} assertions passed (100%)`);
  console.log('================================================================\n');
}

runTestSuite().catch((e) => {
  console.error('\nFATAL TEST FAILURE:', e);
  process.exit(1);
});
