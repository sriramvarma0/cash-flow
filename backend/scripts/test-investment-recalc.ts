import { PrismaClient } from '@prisma/client';
import { InvestmentsService } from '../src/investments/investments.service';

const prisma = new PrismaClient();
const investmentsService = new InvestmentsService(prisma as any);

async function main() {
  console.log('=== Testing Investment Transaction Edit, Delete, & Asset Recalculation ===');

  // Find or create a test user
  let user = await prisma.user.findFirst();
  if (!user) {
    user = await prisma.user.create({
      data: {
        id: '1234567890',
        name: 'Test Recalc User',
        email: 'test_recalc@example.com',
        phoneNumber: '+919876543210',
        passwordHash: 'dummy'
      }
    });
  }

  // 1. Create a test investment holding
  const testAssetId = 'A' + Math.random().toString(36).substring(2, 11).toUpperCase();
  const investment = await prisma.investment.create({
    data: {
      id: testAssetId,
      code: 'TEST_' + Date.now(),
      name: 'Test Corporation',
      type: 'Stock',
      units: 10,
      buyPrice: 100,
      currentPrice: 150,
      color: '#3b82f6',
      userId: user.id
    }
  });

  const tx1Id = 'PB' + Math.random().toString(36).substring(2, 11).toUpperCase();
  const tx1 = await prisma.investmentTransaction.create({
    data: {
      id: tx1Id,
      type: 'BUY',
      units: 10,
      price: 100,
      amount: 1000,
      investmentId: investment.id,
      userId: user.id
    }
  });

  console.log('Step 1: Created investment with 10 units @ 100. Holding ID:', investment.id, 'Tx ID:', tx1.id);

  // 2. Add second transaction: BUY 10 units @ 200
  const tx2Id = 'PB' + Math.random().toString(36).substring(2, 11).toUpperCase();
  const tx2 = await prisma.investmentTransaction.create({
    data: {
      id: tx2Id,
      type: 'BUY',
      units: 10,
      price: 200,
      amount: 2000,
      investmentId: investment.id,
      userId: user.id
    }
  });
  const afterTx2 = await investmentsService.recalculateInvestmentValues(investment.id);
  console.log(`Step 2: Added 10 units @ 200 -> Asset Units: ${afterTx2.units} (expect 20), BuyPrice: ${afterTx2.buyPrice} (expect 150)`);
  if (afterTx2.units !== 20 || afterTx2.buyPrice !== 150) {
    throw new Error(`Step 2 failed: expected 20 units @ 150, got ${afterTx2.units} @ ${afterTx2.buyPrice}`);
  }

  // 3. Edit transaction 2: change to 10 units @ 300
  const editResult = await investmentsService.updateTransaction(user.id, tx2.id, {
    price: 300
  });
  console.log(`Step 3: Edited Tx2 price to 300 -> Asset Units: ${editResult.investment.units} (expect 20), BuyPrice: ${editResult.investment.buyPrice} (expect 200)`);
  if (editResult.investment.units !== 20 || editResult.investment.buyPrice !== 200) {
    throw new Error(`Step 3 failed: expected 20 units @ 200, got ${editResult.investment.units} @ ${editResult.investment.buyPrice}`);
  }

  // 4. Delete transaction 2
  const deleteResult = await investmentsService.deleteTransaction(user.id, tx2.id);
  console.log(`Step 4: Deleted Tx2 -> Asset Units: ${deleteResult.investment.units} (expect 10), BuyPrice: ${deleteResult.investment.buyPrice} (expect 100)`);
  if (deleteResult.investment.units !== 10 || deleteResult.investment.buyPrice !== 100) {
    throw new Error(`Step 4 failed: expected 10 units @ 100, got ${deleteResult.investment.units} @ ${deleteResult.investment.buyPrice}`);
  }

  // Verify asset still exists in DB
  const assetCheck = await prisma.investment.findUnique({ where: { id: investment.id } });
  if (!assetCheck) {
    throw new Error('CRITICAL: Asset was deleted when transaction was deleted!');
  }
  console.log('Step 4 check passed: Asset was NOT deleted.');

  // 5. Delete transaction 1 (now 0 transactions remain)
  const deleteResult2 = await investmentsService.deleteTransaction(user.id, tx1.id);
  console.log(`Step 5: Deleted all transactions -> Asset Units: ${deleteResult2.investment.units} (expect 0), BuyPrice: ${deleteResult2.investment.buyPrice} (expect 0)`);
  if (deleteResult2.investment.units !== 0 || deleteResult2.investment.buyPrice !== 0) {
    throw new Error(`Step 5 failed: expected 0 units @ 0, got ${deleteResult2.investment.units} @ ${deleteResult2.investment.buyPrice}`);
  }

  // Verify asset still exists even when 0 transactions exist
  const assetCheck2 = await prisma.investment.findUnique({ where: { id: investment.id } });
  if (!assetCheck2) {
    throw new Error('CRITICAL: Asset was deleted when all transactions were deleted!');
  }
  console.log('Step 5 check passed: Asset was NOT deleted even with 0 transactions.');

  // Clean up test asset
  await prisma.investment.delete({ where: { id: investment.id } });
  console.log('Test asset cleaned up successfully.');
  console.log('=== All tests passed successfully! ===');
}

main()
  .catch((e) => {
    console.error('Error during test:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
