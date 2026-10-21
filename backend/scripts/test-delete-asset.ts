import { PrismaClient } from '@prisma/client';
import { InvestmentsService } from '../src/investments/investments.service';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const investmentsService = new InvestmentsService(prisma as any);

async function main() {
  console.log('=== Verifying Delete Asset with Password Confirmation & Cascade Deletion ===');

  const testPassword = 'SecurePassword123!';
  const passwordHash = await bcrypt.hash(testPassword, 10);
  const testEmail = `test_delete_${Date.now()}@test.com`;

  // Create a dedicated test user
  const user = await prisma.user.create({
    data: {
      id: Math.floor(1000000000 + Math.random() * 9000000000).toString(),
      name: 'Asset Delete Test User',
      email: testEmail,
      phoneNumber: '+918888' + Math.floor(100000 + Math.random() * 900000),
      passwordHash
    }
  });

  console.log('Created test user:', user.email, 'ID:', user.id);

  // 1. Create an asset with 3 transactions
  const testCode = 'DEL_' + Date.now();
  const asset = await prisma.investment.create({
    data: {
      id: 'A' + Math.random().toString(36).substring(2, 11).toUpperCase(),
      code: testCode,
      name: 'Delete Target Asset',
      type: 'Stock',
      units: 30,
      buyPrice: 100,
      currentPrice: 150,
      color: '#ef4444',
      userId: user.id
    }
  });

  // Create 3 transactions for this asset
  for (let i = 1; i <= 3; i++) {
    await prisma.investmentTransaction.create({
      data: {
        id: 'PB' + Math.random().toString(36).substring(2, 11).toUpperCase(),
        type: 'BUY',
        units: 10,
        price: 100,
        amount: 1000,
        investmentId: asset.id,
        userId: user.id
      }
    });
  }

  const txCountBefore = await prisma.investmentTransaction.count({
    where: { investmentId: asset.id }
  });
  console.log(`Created asset "${asset.code}" with ${txCountBefore} transactions.`);

  // 2. Test deleting with wrong password -> must fail
  console.log('\nTesting wrong password rejection...');
  let failedAsExpected = false;
  try {
    await investmentsService.deleteAsset(user.id, testCode, 'WrongPassword!');
  } catch (err: any) {
    if (err.message?.includes('Incorrect password') || err.status === 401) {
      failedAsExpected = true;
      console.log('Successfully rejected deletion with wrong password:', err.message);
    }
  }

  if (!failedAsExpected) {
    throw new Error('FAILED: Expected wrong password to reject deletion, but it did not fail!');
  }

  // Verify asset and transactions still exist
  const assetStillExists = await prisma.investment.findUnique({ where: { id: asset.id } });
  if (!assetStillExists) {
    throw new Error('FAILED: Asset was deleted even though wrong password was provided!');
  }

  // 3. Test deleting with correct password -> must succeed
  console.log('\nTesting correct password deletion...');
  const deleteResult = await investmentsService.deleteAsset(user.id, testCode, testPassword);
  console.log('Delete result:', deleteResult);

  // 4. Verify asset is deleted
  const assetAfter = await prisma.investment.findUnique({ where: { id: asset.id } });
  if (assetAfter) {
    throw new Error('FAILED: Asset still exists in database after successful deletion!');
  }
  console.log('Confirmed: Asset was successfully deleted from database.');

  // 5. Verify all transactions for this asset were cascade deleted
  const txCountAfter = await prisma.investmentTransaction.count({
    where: { investmentId: asset.id }
  });
  if (txCountAfter !== 0) {
    throw new Error(`FAILED: Expected 0 transactions remaining, found ${txCountAfter}!`);
  }
  console.log('Confirmed: All associated transactions were cascade deleted (0 remaining).');

  // Clean up user
  await prisma.user.delete({ where: { id: user.id } });
  console.log('Test user cleaned up.');
  console.log('=== All Delete Asset Tests Passed Successfully! ===');
}

main()
  .catch((e) => {
    console.error('Error during test:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
