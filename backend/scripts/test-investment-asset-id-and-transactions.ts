import { PrismaClient } from '@prisma/client';
import { InvestmentsService } from '../src/investments/investments.service';
import { PrismaService } from '../src/prisma/prisma.service';

async function runTests() {
  console.log('=== Starting Investment Asset ID & Transaction Tests ===\n');
  const prisma = new PrismaClient();
  const prismaService = prisma as unknown as PrismaService;
  const investmentsService = new InvestmentsService(prismaService);

  // Ensure test users exist
  const user1 = await prisma.user.upsert({
    where: { email: 'test_user1_invest@example.com' },
    update: {},
    create: {
      id: '9990001111',
      name: 'Investor One',
      email: 'test_user1_invest@example.com',
      phoneNumber: '9990001111',
      passwordHash: 'dummy'
    }
  });

  const user2 = await prisma.user.upsert({
    where: { email: 'test_user2_invest@example.com' },
    update: {},
    create: {
      id: '9990002222',
      name: 'Investor Two',
      email: 'test_user2_invest@example.com',
      phoneNumber: '9990002222',
      passwordHash: 'dummy'
    }
  });

  console.log(`Test users: User 1 (${user1.id}), User 2 (${user2.id})`);

  // Clean up any previous test holdings for test users
  await prisma.investmentTransaction.deleteMany({
    where: { userId: { in: [user1.id, user2.id] } }
  });
  await prisma.investment.deleteMany({
    where: { userId: { in: [user1.id, user2.id] } }
  });

  const testCode = 'COALINDIA.NS';
  const testType = 'Stock';

  // Test 1: User 1 adds COALINDIA.NS (asset not present for user 1)
  console.log('\n--- Test 1: User 1 adds new asset (COALINDIA.NS) ---');
  const user1Initial = await investmentsService.create(user1.id, {
    code: testCode,
    type: testType,
    units: 10,
    buyPrice: 400,
    date: new Date().toISOString()
  });

  console.log(`User 1 holding created:`);
  console.log(`  Asset ID: ${user1Initial.assetId}`);
  console.log(`  Code: ${user1Initial.code}`);
  console.log(`  Units: ${user1Initial.units}`);
  console.log(`  Buy Price: ${user1Initial.buyPrice}`);
  console.log(`  Transactions: ${user1Initial.transactions?.length} (ID: ${user1Initial.transactions?.[0]?.id})`);

  if (!user1Initial.assetId || !user1Initial.assetId.startsWith('A')) {
    throw new Error(`Expected assetId to start with 'A', got: ${user1Initial.assetId}`);
  }
  if (user1Initial.units !== 10 || user1Initial.buyPrice !== 400) {
    throw new Error('Initial units/buyPrice mismatch');
  }

  // Test 2: User 2 adds the SAME asset (COALINDIA.NS)
  console.log('\n--- Test 2: User 2 adds the SAME asset (COALINDIA.NS) ---');
  const user2Holding = await investmentsService.create(user2.id, {
    code: testCode,
    type: testType,
    units: 5,
    buyPrice: 410,
    date: new Date().toISOString()
  });

  console.log(`User 2 holding created:`);
  console.log(`  Asset ID: ${user2Holding.assetId}`);
  console.log(`  Units: ${user2Holding.units}`);

  console.log('\n--- Checking Asset ID Unification Across Users ---');
  console.log(`User 1 Asset ID: ${user1Initial.assetId}`);
  console.log(`User 2 Asset ID: ${user2Holding.assetId}`);

  if (user1Initial.assetId !== user2Holding.assetId) {
    throw new Error(`FAIL: Asset ID is NOT identical across users! (${user1Initial.assetId} !== ${user2Holding.assetId})`);
  }
  console.log('SUCCESS: Asset ID is IDENTICAL for all users across the application!');

  // Test 3: User 1 adds asset again (already present)
  // "in investments add asset means addind a transaction. the investment transaction is added then it updates the quantity as per the transaction. of current asset."
  console.log('\n--- Test 3: User 1 adds asset again (adds transaction & updates quantity/average price) ---');
  const user1SecondAdd = await investmentsService.create(user1.id, {
    code: testCode,
    type: testType,
    units: 10,
    buyPrice: 500, // bought 10 @ 400 earlier, now 10 @ 500 -> total 20 units @ avg 450
    date: new Date().toISOString()
  });

  console.log(`User 1 holding updated:`);
  console.log(`  Asset ID: ${user1SecondAdd.assetId}`);
  console.log(`  Units: ${user1SecondAdd.units} (Expected: 20)`);
  console.log(`  Average Buy Price: ${user1SecondAdd.buyPrice} (Expected: 450)`);

  // Verify only ONE holding row exists for user 1
  const user1HoldingsInDb = await prisma.investment.findMany({
    where: { userId: user1.id }
  });
  console.log(`Total holding rows for User 1 in DB: ${user1HoldingsInDb.length}`);

  if (user1HoldingsInDb.length !== 1) {
    throw new Error(`FAIL: Expected 1 holding row for User 1, found ${user1HoldingsInDb.length}!`);
  }
  if (user1SecondAdd.units !== 20 || user1SecondAdd.buyPrice !== 450) {
    throw new Error(`FAIL: Expected units=20 and buyPrice=450, got units=${user1SecondAdd.units}, buyPrice=${user1SecondAdd.buyPrice}`);
  }
  console.log('SUCCESS: Adding asset when already present added a transaction and updated quantity & weighted price!');

  // Test 4: Verify transactions list for User 1
  console.log('\n--- Test 4: Verifying transactions list ---');
  const txs = await investmentsService.getTransactions(user1.id, testCode);
  console.log(`User 1 has ${txs.length} transactions for ${testCode}:`);
  for (const t of txs) {
    console.log(`  - [${t.id}] ${t.type} ${t.units} units @ ${t.price} on ${t.date.toISOString()}`);
  }
  if (txs.length !== 2) {
    throw new Error(`Expected 2 transactions, got ${txs.length}`);
  }

  // Test 5: Verify findAll(userId) returns consistent assetId
  console.log('\n--- Test 5: Verifying findAll returns unified assetId ---');
  const u1List = await investmentsService.findAll(user1.id);
  const u2List = await investmentsService.findAll(user2.id);
  const u1Item = u1List.find(i => i.code === testCode);
  const u2Item = u2List.find(i => i.code === testCode);

  console.log(`findAll User 1 item.assetId: ${u1Item?.assetId}, item.id: ${u1Item?.id}`);
  console.log(`findAll User 2 item.assetId: ${u2Item?.assetId}, item.id: ${u2Item?.id}`);

  if (u1Item?.assetId !== u2Item?.assetId || u1Item?.id !== u2Item?.id) {
    throw new Error('FAIL: findAll returned mismatched Asset IDs!');
  }
  console.log('SUCCESS: findAll returns matching global Asset ID for all users!');

  // Clean up test data
  await prisma.investmentTransaction.deleteMany({
    where: { userId: { in: [user1.id, user2.id] } }
  });
  await prisma.investment.deleteMany({
    where: { userId: { in: [user1.id, user2.id] } }
  });
  await prisma.user.deleteMany({
    where: { id: { in: [user1.id, user2.id] } }
  });

  console.log('\n=== All Tests Passed with 100% Success! ===');
  await prisma.$disconnect();
}

runTests().catch((e) => {
  console.error('Test execution failed:', e);
  process.exit(1);
});

