import { PrismaClient } from '@prisma/client';
import { generateAssetTrackingId } from '../src/common/utils/uuid7.util';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Migrating to Global Application-Wide Asset IDs ===');

  const investments = await prisma.investment.findMany({
    orderBy: { createdAt: 'asc' }
  });

  console.log(`Found ${investments.length} total investment holding(s).`);

  // Group investments by ticker/code (case-insensitive)
  const codeMap = new Map<string, typeof investments>();
  for (const inv of investments) {
    const code = inv.code.trim().toUpperCase();
    if (!codeMap.has(code)) {
      codeMap.set(code, []);
    }
    codeMap.get(code)!.push(inv);
  }

  console.log(`Identified ${codeMap.size} unique asset ticker(s).`);

  for (const [code, holdings] of codeMap.entries()) {
    let asset = await prisma.asset.findUnique({
      where: { code }
    });

    if (!asset) {
      // Find if any holding already has a valid 'A' + 9 alphanumeric ID
      const existingTrackingId = holdings.find(h => /^A[0-9A-Z]{9}$/.test(h.id))?.id;
      let assetId = existingTrackingId || generateAssetTrackingId();

      while (await prisma.asset.findUnique({ where: { id: assetId } })) {
        assetId = generateAssetTrackingId();
      }

      const sample = holdings[0];
      asset = await prisma.asset.create({
        data: {
          id: assetId,
          code,
          name: sample.name,
          type: sample.type,
          currentPrice: sample.currentPrice
        }
      });
      console.log(`Created global asset: [${asset.id}] ${code} - "${asset.name}" (${asset.type})`);
    } else {
      console.log(`Global asset already exists: [${asset.id}] ${code} - "${asset.name}"`);
    }

    // Update all user holdings for this ticker to reference this single global asset ID
    for (const h of holdings) {
      await prisma.investment.update({
        where: { id: h.id },
        data: {
          assetId: asset.id
        }
      });
      console.log(`  -> User [${h.userId}] holding [${h.id}] linked to global assetId [${asset.id}]`);
    }
  }

  console.log('\n=== Verification ===');
  const allAssets = await prisma.asset.findMany({
    include: { investments: true }
  });

  for (const a of allAssets) {
    console.log(`Asset [${a.id}] ${a.code} ("${a.name}"): held by ${a.investments.length} user(s): ${a.investments.map(i => i.userId).join(', ')}`);
  }

  console.log('\nGlobal Asset Migration finished successfully.');
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

