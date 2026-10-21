const { PrismaClient } = require('@prisma/client');
const { generateTransactionTrackingId } = require('../dist/common/utils/uuid7.util');

const prisma = new PrismaClient();

async function main() {
  const txs = await prisma.investmentTransaction.findMany();
  for (const t of txs) {
    const newId = generateTransactionTrackingId(t.type);
    await prisma.$executeRawUnsafe('UPDATE "InvestmentTransaction" SET id = ? WHERE id = ?;', newId, t.id);
    console.log(`Updated transaction ${t.id} -> ${newId}`);
  }
}

main()
  .then(() => {
    console.log('All investment transactions updated successfully.');
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
