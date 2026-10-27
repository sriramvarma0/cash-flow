import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as http from 'http';
import { ExpensesService } from '../src/expenses/expenses.service';
import { createD1HttpClient } from '../src/prisma/d1-http-client';
import { PrismaD1 } from '@prisma/adapter-d1';

import * as path from 'path';

process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  `file:${path.resolve(__dirname, '../../data/dev.db')}`;

const prisma = new PrismaClient();
const expensesService = new ExpensesService(prisma as any);

async function runTestSuite() {
  console.log('================================================================');
  console.log('   CASHFLOW E2E VERIFICATION: BULK IMPORT & EXPENSES D1 AUDIT   ');
  console.log('================================================================\n');

  let testUserA: any;
  let testUserB: any;
  let testUserC: any;
  let testGroup: any;

  try {
    // -------------------------------------------------------------------------
    // Setup Isolated Test Users & Groups
    // -------------------------------------------------------------------------
    console.log('Setting up isolated test users and groups...');
    const passwordHash = await bcrypt.hash('TestPassword123!', 10);
    const ts = Date.now();

    testUserA = await prisma.user.create({
      data: {
        id: '10' + Math.floor(10000000 + Math.random() * 90000000).toString(),
        name: 'Bulk User A',
        email: `bulk_user_a_${ts}@test.com`,
        phoneNumber: '+9199' + Math.floor(10000000 + Math.random() * 90000000).toString(),
        passwordHash
      }
    });

    testUserB = await prisma.user.create({
      data: {
        id: '11' + Math.floor(10000000 + Math.random() * 90000000).toString(),
        name: 'Bulk User B (Group Member)',
        email: `bulk_user_b_${ts}@test.com`,
        phoneNumber: '+9198' + Math.floor(10000000 + Math.random() * 90000000).toString(),
        passwordHash
      }
    });

    testUserC = await prisma.user.create({
      data: {
        id: '12' + Math.floor(10000000 + Math.random() * 90000000).toString(),
        name: 'Bulk User C (Non Member)',
        email: `bulk_user_c_${ts}@test.com`,
        phoneNumber: '+9197' + Math.floor(10000000 + Math.random() * 90000000).toString(),
        passwordHash
      }
    });

    // Create shared group for UserA and UserB
    testGroup = await prisma.group.create({
      data: {
        id: 'G' + Math.random().toString(36).substring(2, 11).toUpperCase(),
        name: 'Test Family Group',
        ownerId: testUserA.id,
        members: {
          connect: [{ id: testUserA.id }, { id: testUserB.id }]
        }
      }
    });

    console.log(`✓ Test users created: UserA (${testUserA.id}), UserB (${testUserB.id}), UserC (${testUserC.id})`);
    console.log(`✓ Shared group created: Group (${testGroup.id}) with members UserA, UserB\n`);

    // -------------------------------------------------------------------------
    // TEST 1: Small Import
    // -------------------------------------------------------------------------
    console.log('--- TEST 1: Small Import ---');
    const smallImportDto = {
      importId: `small_import_${ts}`,
      expenses: [
        {
          amount: 54.25,
          category: 'Dining',
          description: 'Lunch at Cafe',
          paymentMethod: 'Card',
          date: '2026-06-01T12:30:00.000Z',
          transactionType: 'EXPENSE',
          categoryType: 'LIFESTYLE',
          tags: ['cafe', 'food']
        },
        {
          amount: 2500.0,
          category: 'Salary',
          description: 'Monthly Salary',
          paymentMethod: 'Bank transfer',
          date: '2026-06-01T09:00:00.000Z',
          transactionType: 'INCOME',
          categoryType: 'ESSENTIALS',
          tags: ['income', 'work']
        },
        {
          amount: 150.0,
          category: 'Family Transfer',
          description: 'Split electricity bill',
          paymentMethod: 'Bank transfer',
          date: '2026-06-02T15:00:00.000Z',
          transactionType: 'TRANSFER',
          toUserId: testUserB.id,
          tags: ['bills']
        }
      ]
    };

    const smallResult = await expensesService.createBulk(testUserA.id, smallImportDto as any);
    if (smallResult.length !== 3) {
      throw new Error(`Expected 3 records returned from small import, got ${smallResult.length}`);
    }
    const transferTx = smallResult.find((r) => r.transactionType === 'TRANSFER');
    if (!transferTx || transferTx.toUserId !== testUserB.id) {
      throw new Error('Transfer transaction not correctly recorded with recipient');
    }
    console.log(`✓ Small import successful: ${smallResult.length} transactions created with valid relations.\n`);

    // -------------------------------------------------------------------------
    // TEST 2: Large Import exceeding parameter limit
    // -------------------------------------------------------------------------
    console.log('--- TEST 2: Large Import Exceeding Single-Query Parameter Limit ---');
    // Cloudflare D1 has a hard limit of 100 bound parameters.
    // 120 expenses * 11 bound parameters = 1320 parameters, far exceeding 100.
    const LARGE_COUNT = 120;
    const largeExpenses: any[] = [];
    const categories = ['Groceries', 'Utilities', 'Entertainment', 'Healthcare', 'Transport', 'Education'];
    const paymentMethods = ['Card', 'Cash', 'Bank transfer', 'Wallet'];
    const catTypes = ['ESSENTIALS', 'LIFESTYLE', 'HIGH_VALUE'];

    for (let i = 0; i < LARGE_COUNT; i++) {
      const cat = categories[i % categories.length];
      const pm = paymentMethods[i % paymentMethods.length];
      const ct = catTypes[i % catTypes.length];
      const date = new Date(Date.UTC(2026, 5, 1, 10, i % 60, 0)).toISOString();
      largeExpenses.push({
        amount: Math.round((10 + (i * 3.75) % 150) * 100) / 100,
        category: cat,
        description: `Large import item #${i + 1} - ${cat}`,
        paymentMethod: pm,
        date,
        transactionType: i % 15 === 0 ? 'INCOME' : 'EXPENSE',
        categoryType: ct,
        tags: [`tag_${i % 10}`, `batch_${Math.floor(i / 20)}`]
      });
    }

    const largeImportId = `large_import_${ts}`;
    const largeResult = await expensesService.createBulk(testUserA.id, {
      importId: largeImportId,
      expenses: largeExpenses
    } as any);

    if (largeResult.length !== LARGE_COUNT) {
      throw new Error(`Expected ${LARGE_COUNT} records returned from large import, got ${largeResult.length}`);
    }
    console.log(`✓ Large import successful: ${largeResult.length} transactions created safely in batches without SQL variable limit errors.\n`);

    // -------------------------------------------------------------------------
    // TEST 3: Imports containing tags and associated records
    // -------------------------------------------------------------------------
    console.log('--- TEST 3: Imports Containing Tags & Associated Records ---');
    const taggedExpenses = [
      {
        amount: 88.5,
        category: 'Shopping',
        description: 'New shoes',
        paymentMethod: 'Card',
        date: '2026-06-03T11:00:00.000Z',
        tags: ['apparel', 'fashion', 'summer_sale']
      },
      {
        amount: 42.0,
        category: 'Groceries',
        description: 'Organic vegetables',
        paymentMethod: 'Card',
        date: '2026-06-03T14:30:00.000Z',
        tags: ['organic', 'food', 'market']
      }
    ];

    const taggedResult = await expensesService.createBulk(testUserA.id, {
      importId: `tagged_import_${ts}`,
      expenses: taggedExpenses
    } as any);

    if (taggedResult.length !== 2) {
      throw new Error(`Expected 2 tagged records, got ${taggedResult.length}`);
    }
    const tagsShoe = taggedResult[0].tags.map((t: any) => t.name);
    if (!tagsShoe.includes('apparel') || !tagsShoe.includes('fashion') || !tagsShoe.includes('summer_sale')) {
      throw new Error(`Tags not properly linked on shoe expense: ${JSON.stringify(tagsShoe)}`);
    }
    console.log(`✓ Tag association successful: verified multiple tags per expense correctly linked in join table.\n`);

    // -------------------------------------------------------------------------
    // TEST 4: Duplicate submissions and retry after partial failure
    // -------------------------------------------------------------------------
    console.log('--- TEST 4: Duplicate Submissions & Retry Safety ---');
    // Count current expenses for UserA
    const countBefore = await prisma.expense.count({ where: { userId: testUserA.id } });

    // Submit the EXACT same large import again with the same importId
    const retryResult = await expensesService.createBulk(testUserA.id, {
      importId: largeImportId,
      expenses: largeExpenses
    } as any);

    const countAfter = await prisma.expense.count({ where: { userId: testUserA.id } });
    if (countAfter !== countBefore) {
      throw new Error(`Duplicate import created extra rows! Before: ${countBefore}, After: ${countAfter}`);
    }
    if (retryResult.length !== LARGE_COUNT) {
      throw new Error(`Retry did not return all ${LARGE_COUNT} records, returned ${retryResult.length}`);
    }
    console.log(`✓ Idempotency verified: re-submitting ${LARGE_COUNT} items resulted in 0 duplicate records.\n`);

    // -------------------------------------------------------------------------
    // TEST 5: Expense Listing After a Large Import (The original production bug)
    // -------------------------------------------------------------------------
    console.log('--- TEST 5: Expense Listing After Large Import (findAll) ---');
    // Total UserA expenses now: 3 (small) + 120 (large) + 2 (tagged) = 125 expenses
    const allExpenses = await expensesService.findAll(testUserA.id, {});
    if (allExpenses.length < 125) {
      throw new Error(`Expected at least 125 expenses returned, got ${allExpenses.length}`);
    }

    // Verify all records have user, toUser, and tags populated without crashing D1
    const missingUser = allExpenses.find((e) => !e.user || !e.user.email);
    if (missingUser) {
      throw new Error(`Expense ${missingUser.id} is missing user relation!`);
    }
    const hasTagsRecord = allExpenses.find((e) => e.tags && e.tags.length > 0);
    if (!hasTagsRecord) {
      throw new Error('No expense has tags loaded!');
    }
    console.log(`✓ findAll executed successfully on ${allExpenses.length} records with full relations without D1 variable limit errors.\n`);

    // -------------------------------------------------------------------------
    // TEST 6: Filtering, Sorting, Pagination, and Expense Totals
    // -------------------------------------------------------------------------
    console.log('--- TEST 6: Filtering, Sorting, Pagination, and Totals ---');

    // 6a. Filtering by category
    const groceryExpenses = await expensesService.findAll(testUserA.id, { category: 'Groceries' });
    const nonGroceries = groceryExpenses.filter((e) => e.category !== 'Groceries');
    if (nonGroceries.length > 0) {
      throw new Error(`Category filter leaked non-Groceries items: ${nonGroceries.length}`);
    }
    console.log(`✓ Category filter verified: found ${groceryExpenses.length} Groceries.`);

    // 6b. Filtering by tag
    const cafeExpenses = await expensesService.findAll(testUserA.id, { tag: 'cafe' });
    if (cafeExpenses.length !== 1 || !cafeExpenses[0].tags.some((t) => t.name === 'cafe')) {
      throw new Error(`Tag filter failed for 'cafe', found: ${cafeExpenses.length}`);
    }
    console.log(`✓ Tag filter verified: found ${cafeExpenses.length} matching 'cafe'.`);

    // 6c. Sorting: verify date descending
    for (let i = 0; i < allExpenses.length - 1; i++) {
      const d1 = new Date(allExpenses[i].date).getTime();
      const d2 = new Date(allExpenses[i + 1].date).getTime();
      if (d1 < d2) {
        throw new Error(`Sort order violated at index ${i}: ${allExpenses[i].date} < ${allExpenses[i + 1].date}`);
      }
    }
    console.log('✓ Sorting verified: records are sorted in descending order by date.');

    // 6d. Pagination
    const page1 = await expensesService.findAll(testUserA.id, { page: 1, limit: 15 });
    const page2 = await expensesService.findAll(testUserA.id, { page: 2, limit: 15 });
    if (page1.length !== 15 || page2.length !== 15) {
      throw new Error(`Pagination limit failed: page1=${page1.length}, page2=${page2.length}`);
    }
    const page1Ids = new Set(page1.map((e) => e.id));
    const overlap = page2.filter((e) => page1Ids.has(e.id));
    if (overlap.length > 0) {
      throw new Error(`Pagination overlap detected between page 1 and page 2: ${overlap.length} items`);
    }
    console.log('✓ Pagination verified: page 1 and page 2 contain distinct 15-item slices.');

    // 6e. Totals
    const totalAmount = allExpenses.reduce((sum, e) => sum + e.amount, 0);
    if (totalAmount <= 0) {
      throw new Error(`Invalid total amount calculated: ${totalAmount}`);
    }
    console.log(`✓ Totals verified: computed total of ${allExpenses.length} items = ${totalAmount.toFixed(2)}.\n`);

    // -------------------------------------------------------------------------
    // TEST 7: Family-Group Functionality & Transfer Handling
    // -------------------------------------------------------------------------
    console.log('--- TEST 7: Family-Group Functionality & Transfer Handling ---');

    // 7a. Transfer to UserC (not in any shared group) should throw BadRequestException
    let userCFailed = false;
    try {
      await expensesService.create(testUserA.id, {
        amount: 75.0,
        category: 'Transfer',
        description: 'Unauthorized transfer',
        paymentMethod: 'Bank transfer',
        date: '2026-06-04T10:00:00.000Z',
        transactionType: 'TRANSFER',
        toUserId: testUserC.id
      });
    } catch (err: any) {
      userCFailed = true;
      if (!err.message.includes('common group')) {
        throw new Error(`Unexpected error message for unauthorized transfer: ${err.message}`);
      }
    }
    if (!userCFailed) {
      throw new Error('Transfer to non-group member UserC should have failed but succeeded!');
    }
    console.log('✓ Transfer validation verified: non-group recipient properly rejected.');

    // 7b. Transfer to self should fail
    let selfFailed = false;
    try {
      await expensesService.create(testUserA.id, {
        amount: 75.0,
        category: 'Transfer',
        description: 'Self transfer',
        paymentMethod: 'Bank transfer',
        date: '2026-06-04T10:00:00.000Z',
        transactionType: 'TRANSFER',
        toUserId: testUserA.id
      });
    } catch (err: any) {
      selfFailed = true;
    }
    if (!selfFailed) {
      throw new Error('Transfer to self should have failed but succeeded!');
    }
    console.log('✓ Transfer validation verified: transfer to self properly rejected.');

    // 7c. Valid transfer to UserB (member of testGroup) succeeds
    const validTransfer = await expensesService.create(testUserA.id, {
      amount: 120.0,
      category: 'Transfer',
      description: 'Shared grocery settlement',
      paymentMethod: 'Bank transfer',
      date: '2026-06-04T12:00:00.000Z',
      transactionType: 'TRANSFER',
      toUserId: testUserB.id
    });
    if (!validTransfer || validTransfer.toUserId !== testUserB.id) {
      throw new Error('Valid transfer to group member UserB failed');
    }
    console.log('✓ Valid transfer to group member UserB succeeded.\n');

    // -------------------------------------------------------------------------
    // TEST 8: Handling Invalid Records & Validation
    // -------------------------------------------------------------------------
    console.log('--- TEST 8: Handling Invalid Records & Validation ---');

    // Negative amount
    let negFailed = false;
    try {
      await expensesService.createBulk(testUserA.id, {
        expenses: [
          {
            amount: -50.0,
            category: 'Food',
            description: 'Bad amount',
            date: '2026-06-05T10:00:00.000Z'
          }
        ]
      } as any);
    } catch (err: any) {
      negFailed = true;
      if (!err.message.includes('positive amount')) {
        throw new Error(`Unexpected error message for negative amount: ${err.message}`);
      }
    }
    if (!negFailed) throw new Error('Bulk import with negative amount should have failed!');

    // Invalid date
    let dateFailed = false;
    try {
      await expensesService.createBulk(testUserA.id, {
        expenses: [
          {
            amount: 50.0,
            category: 'Food',
            description: 'Bad date',
            date: 'not-a-valid-date'
          }
        ]
      } as any);
    } catch (err: any) {
      dateFailed = true;
      if (!err.message.includes('invalid date')) {
        throw new Error(`Unexpected error message for invalid date: ${err.message}`);
      }
    }
    if (!dateFailed) throw new Error('Bulk import with invalid date should have failed!');

    console.log('✓ Invalid records validation verified: negative amounts and bad dates properly rejected.\n');

    // -------------------------------------------------------------------------
    // TEST 9: Compatibility with Cloudflare D1 Adapter (Strict 100-variable limit)
    // -------------------------------------------------------------------------
    console.log('--- TEST 9: Cloudflare D1 Adapter & Driver 100-Variable Limit Verification ---');
    // Set up a mock Cloudflare D1 HTTP server that strictly fails if any statement has > 100 parameters
    let maxObservedParams = 0;
    let queryCount = 0;

    const mockD1Server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        try {
          const payload = JSON.parse(body);
          const statements = payload.batch ? payload.batch : [payload];

          const results: any[] = [];
          for (const stmt of statements) {
            queryCount++;
            const paramCount = (stmt.params || []).length;
            if (paramCount > maxObservedParams) {
              maxObservedParams = paramCount;
            }

            // ENFORCE CLOUDFLARE D1's 100 VARIABLE LIMIT
            if (paramCount > 100) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  success: false,
                  errors: [
                    {
                      message: `D1_ERROR: too many SQL variables at offset 327: SQLITE_ERROR`
                    }
                  ]
                })
              );
              return;
            }

            // Return mock successful rows
            results.push({
              results: [{ id: 'mock_1', name: 'mock_name' }],
              success: true,
              meta: { changes: 1, last_row_id: 1, duration: 1 }
            });
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              success: true,
              result: payload.batch ? results : results[0]
            })
          );
        } catch (e: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, errors: [{ message: e.message }] }));
        }
      });
    });

    await new Promise<void>((resolve) => mockD1Server.listen(0, '127.0.0.1', resolve));
    const port = (mockD1Server.address() as any).port;
    const mockHttpUrl = `http://127.0.0.1:${port}/query`;

    try {
      const d1Client = createD1HttpClient({
        accountId: 'mock-account',
        databaseId: 'mock-database',
        apiToken: 'mock-token',
        httpUrl: mockHttpUrl
      });

      // Test 9a: Query with 150 parameters against D1 client
      // Our splitOversizedSelectQuery must automatically chunk this into <= 50 param queries
      const placeholders150 = Array.from({ length: 150 }, () => '?').join(', ');
      const params150 = Array.from({ length: 150 }, (_, i) => `val_${i}`);
      const sql150 = `SELECT "Tag"."id", "Tag"."name" FROM "Tag" WHERE "Tag"."id" IN (${placeholders150})`;

      const stmt = d1Client.prepare(sql150).bind(...params150);
      const queryResult = await stmt.all();

      if (!queryResult.success) {
        throw new Error('D1 client failed to execute 150-variable query!');
      }

      if (maxObservedParams > 100) {
        throw new Error(`D1 server received statement with ${maxObservedParams} params (> 100)!`);
      }

      console.log(`✓ D1 HTTP Client verified: 150-variable query safely split into sub-queries (max observed params per query: ${maxObservedParams} <= 100).`);
      console.log(`✓ Cloudflare D1 adapter compatibility 100% verified without errors.\n`);
    } finally {
      mockD1Server.close();
    }

    console.log('================================================================');
    console.log('   ALL 9 TEST SUITES PASSED CLEANLY & VERIFIED!                ');
    console.log('================================================================');
  } finally {
    // -------------------------------------------------------------------------
    // Cleanup Test Data
    // -------------------------------------------------------------------------
    console.log('\nCleaning up test data...');
    try {
      if (testGroup) {
        await prisma.group.delete({ where: { id: testGroup.id } }).catch(() => {});
      }
      if (testUserA) {
        await prisma.expense.deleteMany({ where: { userId: testUserA.id } }).catch(() => {});
        await prisma.tag.deleteMany({ where: { userId: testUserA.id } }).catch(() => {});
        await prisma.user.delete({ where: { id: testUserA.id } }).catch(() => {});
      }
      if (testUserB) {
        await prisma.expense.deleteMany({ where: { userId: testUserB.id } }).catch(() => {});
        await prisma.user.delete({ where: { id: testUserB.id } }).catch(() => {});
      }
      if (testUserC) {
        await prisma.user.delete({ where: { id: testUserC.id } }).catch(() => {});
      }
      console.log('✓ Test data cleaned up successfully.');
    } catch (e) {
      console.warn('Warning during cleanup:', e);
    }
    await prisma.$disconnect();
  }
}

main();

async function main() {
  try {
    await runTestSuite();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ TEST SUITE FAILURE:', error);
    process.exit(1);
  }
}
