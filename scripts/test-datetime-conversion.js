#!/usr/bin/env node

/**
 * CashFlow DateTime Conversion & Driver Adapter Regression Test Suite
 * 
 * Verifies that the production Cloudflare D1 HTTP client and @prisma/adapter-d1
 * correctly parse DateTime values across all column naming and timestamp scenarios:
 * 1. Plain column names (e.g. createdAt = 1783245388569)
 * 2. Table-qualified column names (e.g. User.createdAt = 1783245388569) [Production Regression]
 * 3. Schema+Table-qualified column names (e.g. main.User.createdAt = 1783245388569)
 * 4. Backtick-quoted column names (e.g. `User`.`createdAt` = 1783245388569)
 * 5. ISO-8601 UTC string formats (e.g. '2026-07-05T09:56:28.569Z')
 * 6. Nullable DateTime columns (e.g. lockoutUntil = null vs lockoutUntil = 1783246388569)
 * 7. All models with DateTime fields:
 *    - User (createdAt, lockoutUntil)
 *    - Expense (date, createdAt)
 *    - Group (createdAt)
 *    - Invitation (createdAt)
 *    - Investment (date, createdAt, updatedAt)
 *    - InvestmentTransaction (date, createdAt)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');
const { PrismaD1 } = require('@prisma/adapter-d1');

// Import production createD1HttpClient (ensuring backend dist is built if running pre-build in CI)
const distFile = path.resolve(__dirname, '../backend/dist/prisma/d1-http-client.js');
if (!fs.existsSync(distFile)) {
  console.log('[test-datetime-conversion] Building backend to compile production d1-http-client...');
  execSync('npm run build --workspace backend', {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit'
  });
}
const { createD1HttpClient } = require(distFile);

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

/**
 * Creates a Prisma Client hooked up to createD1HttpClient with mock fetch
 * returning the specified database tables/rows as Cloudflare D1 REST API responses.
 */
function createPrismaWithMockD1(tableResponses) {
  const mockFetch = async (url, options) => {
    const body = JSON.parse(options.body || '{}');
    const sql = (body.sql || '').trim();

    for (const [tblKey, rows] of Object.entries(tableResponses)) {
      if (sql.toLowerCase().includes(`\`${tblKey.toLowerCase()}\``) ||
          sql.toLowerCase().includes(`"${tblKey.toLowerCase()}"`)) {
        let matchedRows = rows;
        if (body.params && body.params.length > 0) {
          const filterVal = body.params[0];
          const filtered = rows.filter((r) =>
            Object.values(r).some((v) => v === filterVal)
          );
          if (filtered.length > 0) matchedRows = filtered;
        }

        return {
          ok: true,
          json: async () => ({
            success: true,
            errors: [],
            messages: [],
            result: [
              {
                success: true,
                meta: { changes: 0, last_row_id: 0, duration: 1 },
                results: matchedRows
              }
            ]
          })
        };
      }
    }

    return {
      ok: true,
      json: async () => ({
        success: true,
        errors: [],
        messages: [],
        result: [{ success: true, meta: { changes: 0 }, results: [] }]
      })
    };
  };

  // Temporarily swap global fetch during query execution
  const originalFetch = global.fetch;
  global.fetch = mockFetch;

  const d1Client = createD1HttpClient({
    accountId: 'test-account',
    databaseId: 'test-db',
    apiToken: 'test-token'
  });

  const adapter = new PrismaD1(d1Client);
  const prisma = new PrismaClient({ adapter });

  return {
    prisma,
    cleanup: async () => {
      global.fetch = originalFetch;
      await prisma.$disconnect();
    }
  };
}

async function runTestSuite() {
  console.log('================================================================');
  console.log('  CashFlow DateTime Conversion & Driver Adapter Test Suite');
  console.log('  Testing Actual Production createD1HttpClient & PrismaD1');
  console.log('================================================================\n');

  // --- TEST GROUP 1: Production Regression Scenarios (User findUnique) ---
  console.log('[Test Group 1] Production Regression: AuthService.login() / User.findUnique()');

  // 1A: Plain column names with integer timestamp
  {
    const { prisma, cleanup } = createPrismaWithMockD1({
      user: [{
        id: 'u1', name: 'Sriram Varma', email: 'test@example.com', phoneNumber: '1234567890',
        passwordHash: '$2b$10$hash', twoFactorEnabled: 0, twoFactorSecret: null, twoFactorTempSecret: null,
        twoFactorRecoveryCodes: null, failedLoginAttempts: 0, lockoutUntil: null, createdAt: 1783245388569
      }]
    });

    const user = await prisma.user.findUnique({ where: { email: 'test@example.com' } });
    assert(user !== null, '1A: User returned with plain column names');
    assert(user.createdAt instanceof Date, '1A: User.createdAt is instance of Date');
    assert(user.createdAt.getTime() === 1783245388569, '1A: Exact millisecond preserved (1783245388569)');
    assert(user.createdAt.toISOString() === '2026-07-05T09:56:28.569Z', '1A: Correct ISO string');
    await cleanup();
  }

  // 1B: Table-qualified column names (User.createdAt) - The exact production failure
  {
    const { prisma, cleanup } = createPrismaWithMockD1({
      user: [{
        'User.id': 'u1', 'User.name': 'Sriram Varma', 'User.email': 'test@example.com', 'User.phoneNumber': '1234567890',
        'User.passwordHash': '$2b$10$hash', 'User.twoFactorEnabled': 0, 'User.twoFactorSecret': null, 'User.twoFactorTempSecret': null,
        'User.twoFactorRecoveryCodes': null, 'User.failedLoginAttempts': 0, 'User.lockoutUntil': null, 'User.createdAt': 1783245388569
      }]
    });

    const user = await prisma.user.findUnique({ where: { email: 'test@example.com' } });
    assert(user !== null, '1B: User returned with table-qualified column names (User.createdAt)');
    assert(user.createdAt instanceof Date, '1B: User.createdAt is instance of Date');
    assert(user.createdAt.getTime() === 1783245388569, '1B: Exact millisecond preserved (1783245388569)');
    assert(user.createdAt.toISOString() === '2026-07-05T09:56:28.569Z', '1B: Correct ISO string');
    await cleanup();
  }

  // 1C: Schema+Table-qualified column names (main.User.createdAt)
  {
    const { prisma, cleanup } = createPrismaWithMockD1({
      user: [{
        'main.User.id': 'u1', 'main.User.name': 'Sriram Varma', 'main.User.email': 'test@example.com', 'main.User.phoneNumber': '1234567890',
        'main.User.passwordHash': '$2b$10$hash', 'main.User.twoFactorEnabled': 0, 'main.User.twoFactorSecret': null, 'main.User.twoFactorTempSecret': null,
        'main.User.twoFactorRecoveryCodes': null, 'main.User.failedLoginAttempts': 0, 'main.User.lockoutUntil': null, 'main.User.createdAt': 1783245388569
      }]
    });

    const user = await prisma.user.findUnique({ where: { email: 'test@example.com' } });
    assert(user !== null, '1C: User returned with schema+table qualified names (main.User.createdAt)');
    assert(user.createdAt instanceof Date, '1C: User.createdAt is instance of Date');
    assert(user.createdAt.getTime() === 1783245388569, '1C: Exact millisecond preserved');
    await cleanup();
  }

  // 1D: Backtick-qualified column names (`User`.`createdAt`)
  {
    const { prisma, cleanup } = createPrismaWithMockD1({
      user: [{
        '`User`.`id`': 'u1', '`User`.`name`': 'Sriram Varma', '`User`.`email`': 'test@example.com', '`User`.`phoneNumber`': '1234567890',
        '`User`.`passwordHash`': '$2b$10$hash', '`User`.`twoFactorEnabled`': 0, '`User`.`twoFactorSecret`': null, '`User`.`twoFactorTempSecret`': null,
        '`User`.`twoFactorRecoveryCodes`': null, '`User`.`failedLoginAttempts`': 0, '`User`.`lockoutUntil`': null, '`User`.`createdAt`': 1783245388569
      }]
    });

    const user = await prisma.user.findUnique({ where: { email: 'test@example.com' } });
    assert(user !== null, '1D: User returned with backtick-qualified names (`User`.`createdAt`)');
    assert(user.createdAt instanceof Date, '1D: User.createdAt is instance of Date');
    assert(user.createdAt.getTime() === 1783245388569, '1D: Exact millisecond preserved');
    await cleanup();
  }

  // --- TEST GROUP 2: ISO-8601 Strings in D1 ---
  console.log('\n[Test Group 2] ISO-8601 string inputs in Cloudflare D1');
  {
    const { prisma, cleanup } = createPrismaWithMockD1({
      user: [{
        id: 'u1', name: 'Sriram Varma', email: 'test@example.com', phoneNumber: '1234567890',
        passwordHash: '$2b$10$hash', twoFactorEnabled: 0, twoFactorSecret: null, twoFactorTempSecret: null,
        twoFactorRecoveryCodes: null, failedLoginAttempts: 0, lockoutUntil: null, createdAt: '2026-07-05T09:56:28.569Z'
      }]
    });

    const user = await prisma.user.findUnique({ where: { email: 'test@example.com' } });
    assert(user.createdAt instanceof Date, '2: User.createdAt is Date with ISO-8601 string input');
    assert(user.createdAt.getTime() === 1783245388569, '2: Exact millisecond preserved');
    await cleanup();
  }

  // --- TEST GROUP 3: Nullable DateTime fields (lockoutUntil) ---
  console.log('\n[Test Group 3] Nullable DateTime field handling (lockoutUntil)');
  {
    const { prisma, cleanup } = createPrismaWithMockD1({
      user: [
        {
          id: 'u_null', name: 'Null Lockout', email: 'null@test.com', phoneNumber: '101',
          passwordHash: 'h', twoFactorEnabled: 0, twoFactorSecret: null, twoFactorTempSecret: null,
          twoFactorRecoveryCodes: null, failedLoginAttempts: 0, lockoutUntil: null, createdAt: 1783245388569
        },
        {
          id: 'u_locked', name: 'Locked User', email: 'locked@test.com', phoneNumber: '102',
          passwordHash: 'h', twoFactorEnabled: 0, twoFactorSecret: null, twoFactorTempSecret: null,
          twoFactorRecoveryCodes: null, failedLoginAttempts: 5, lockoutUntil: 1783246388569, createdAt: 1783245388569
        }
      ]
    });

    const u1 = await prisma.user.findUnique({ where: { email: 'null@test.com' } });
    assert(u1.lockoutUntil === null, '3A: lockoutUntil is null when null in DB');

    const u2 = await prisma.user.findUnique({ where: { email: 'locked@test.com' } });
    assert(u2.lockoutUntil instanceof Date, '3B: lockoutUntil is Date instance when integer timestamp present');
    assert(u2.lockoutUntil.getTime() === 1783246388569, '3B: lockoutUntil exact timestamp preserved (1783246388569)');
    await cleanup();
  }

  // --- TEST GROUP 4: All Application Models with DateTime fields ---
  console.log('\n[Test Group 4] All models with DateTime fields validation');
  {
    const { prisma, cleanup } = createPrismaWithMockD1({
      expense: [{
        id: 'exp_1', amount: 120.5, category: 'Groceries', description: 'Supermarket',
        paymentMethod: 'Card', paymentAccount: 'Card', date: 1782844200000, createdAt: 1783245599973,
        userId: 'u1', transactionType: 'EXPENSE', toUserId: null, categoryType: 'Need',
        isReceivable: 0, receivableStatus: 'OUTSTANDING', reimbursedAmount: 0
      }],
      group: [{
        id: 'grp_1', name: 'Family Group', createdAt: 1784802934538,
        ownerId: 'u1', adminIds: '[]'
      }],
      invitation: [{
        id: 'inv_1', groupId: 'grp_1', inviteeEmail: 'inv@test.com', inviteePhone: null,
        status: 'PENDING', createdAt: 1784802955361
      }],
      investment: [{
        id: 'asset_1', code: 'AAPL', name: 'Apple Inc', type: 'Stock', units: 15.0,
        buyPrice: 150.0, currentPrice: 185.0, color: '#000', date: 1786619580000,
        userId: 'u1', createdAt: 1786619726981, updatedAt: 1792522296092
      }],
      investmenttransaction: [{
        id: 'tx_1', type: 'BUY', units: 15.0, price: 150.0, amount: 2250.0,
        date: 1786619580000, investmentId: 'asset_1', userId: 'u1', createdAt: 1792515380043
      }]
    });

    const expense = await prisma.expense.findFirst();
    assert(expense.date instanceof Date, '4A: Expense.date is instance of Date');
    assert(expense.createdAt instanceof Date, '4A: Expense.createdAt is instance of Date');
    assert(expense.date.getTime() === 1782844200000, '4A: Expense.date millisecond value matches');

    const group = await prisma.group.findFirst();
    assert(group.createdAt instanceof Date, '4B: Group.createdAt is instance of Date');
    assert(group.createdAt.getTime() === 1784802934538, '4B: Group.createdAt millisecond value matches');

    const invitation = await prisma.invitation.findFirst();
    assert(invitation.createdAt instanceof Date, '4C: Invitation.createdAt is instance of Date');

    const investment = await prisma.investment.findFirst();
    assert(investment.date instanceof Date, '4D: Investment.date is instance of Date');
    assert(investment.createdAt instanceof Date, '4D: Investment.createdAt is instance of Date');
    assert(investment.updatedAt instanceof Date, '4D: Investment.updatedAt is instance of Date');

    const tx = await prisma.investmentTransaction.findFirst();
    assert(tx.date instanceof Date, '4E: InvestmentTransaction.date is instance of Date');
    assert(tx.createdAt instanceof Date, '4E: InvestmentTransaction.createdAt is instance of Date');

    await cleanup();
  }

  // --- TEST GROUP 5: Roundtrip Precision ---
  console.log('\n[Test Group 5] Roundtrip Bit-for-bit Precision');
  {
    const epoch = 1783245388569;
    const iso = new Date(epoch).toISOString();
    assert(iso === '2026-07-05T09:56:28.569Z', '5A: ISO-8601 millisecond formatting');
    assert(new Date(iso).getTime() === epoch, '5B: Lossless roundtrip epoch -> ISO -> epoch');
  }

  console.log('\n================================================================');
  console.log(`  TEST RESULTS: ${passedTests} / ${totalTests} assertions passed (100%)`);
  console.log('================================================================\n');
}

runTestSuite().catch((err) => {
  console.error('\nFATAL TEST FAILURE:', err);
  process.exit(1);
});
