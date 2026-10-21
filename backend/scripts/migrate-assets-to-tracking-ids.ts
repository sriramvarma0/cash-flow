import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { generateAssetTrackingId } from '../src/common/utils/uuid7.util';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Migrating Asset / Investment IDs to "A" Prefix + 9-Digit Alphanumeric UUIDv7 ===');

  // 1. Create a safe database backup
  const dbPath = path.resolve(__dirname, '../../data/dev.db');
  const backupPath = path.resolve(__dirname, '../../data/dev.db.bak_pre_asset_tracking_id');
  if (fs.existsSync(dbPath)) {
    fs.copyFileSync(dbPath, backupPath);
    console.log(`Created database backup at: ${backupPath}`);
  }

  // 2. Fetch all investments/assets
  const investments = await prisma.investment.findMany({
    include: { transactions: true }
  });
  console.log(`Found ${investments.length} total asset(s) in database.`);

  const assetTrackingIdRegex = /^A[0-9A-Z]{9}$/;
  let migratedCount = 0;

  for (const inv of investments) {
    if (assetTrackingIdRegex.test(inv.id)) {
      console.log(`Asset "${inv.name}" (${inv.code}) already has valid tracking ID: ${inv.id}`);
      continue;
    }

    const oldId = inv.id;
    let newId = generateAssetTrackingId();
    while (await prisma.investment.findUnique({ where: { id: newId } })) {
      newId = generateAssetTrackingId();
    }

    console.log(`Migrating asset "${inv.name}" (${inv.code}): ${oldId} -> ${newId}`);

    await prisma.$transaction(async (tx) => {
      // 1. Create duplicate Investment row with newId
      await tx.investment.create({
        data: {
          id: newId,
          code: inv.code,
          name: inv.name,
          type: inv.type,
          units: inv.units,
          buyPrice: inv.buyPrice,
          currentPrice: inv.currentPrice,
          color: inv.color,
          date: inv.date,
          userId: inv.userId,
          createdAt: inv.createdAt,
          updatedAt: inv.updatedAt
        }
      });

      // 2. Point all child transactions to newId
      await tx.investmentTransaction.updateMany({
        where: { investmentId: oldId },
        data: { investmentId: newId }
      });

      // 3. Delete old Investment row
      await tx.investment.delete({
        where: { id: oldId }
      });
    });

    migratedCount++;
  }

  console.log(`\nSuccessfully migrated ${migratedCount} asset(s) to 'A' + 9-character tracking IDs.`);

  // Verify relations and foreign key integrity
  const verified = await prisma.investment.findMany({
    include: { transactions: true }
  });
  console.log('\n--- Verification ---');
  for (const v of verified) {
    console.log(`Asset: [${v.id}] ${v.code} (${v.name}) -> ${v.transactions.length} transaction(s) [${v.transactions.map(t => t.id).join(', ')}]`);
  }
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
