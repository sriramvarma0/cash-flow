import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { generateTransactionTrackingId, getTransactionPrefix } from '../src/common/utils/uuid7.util';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Migrating Transaction, Asset & Group IDs to Tracking IDs (UUIDv7) ===');

  // 1. Create a safe database backup
  const dbPath = path.resolve(__dirname, '../../data/dev.db');
  const backupPath = path.resolve(__dirname, '../../data/dev.db.bak_pre_tracking_id');
  if (fs.existsSync(dbPath)) {
    fs.copyFileSync(dbPath, backupPath);
    console.log(`Created database backup at: ${backupPath}`);
  }

  // 2. Migrate Expense records (EXPENSE -> E, INCOME -> I, TRANSFER -> TE/TI)
  const expenses = await prisma.expense.findMany({
    select: { id: true, transactionType: true, description: true, amount: true }
  });
  console.log(`Found ${expenses.length} total expense/income/transfer record(s) in database.`);

  let migratedExpensesCount = 0;
  const trackingIdRegex = /^((TE|TI)[0-9A-Z]{8}|(E|I|PB|PS)[0-9A-Z]{9})$/;

  for (const exp of expenses) {
    const expectedPrefix = getTransactionPrefix(exp.transactionType);
    const isAlreadyMigrated = trackingIdRegex.test(exp.id) && exp.id.startsWith(expectedPrefix);

    if (isAlreadyMigrated) {
      console.log(`Expense "${exp.description || 'No note'}" ($${exp.amount}) already has valid tracking ID: ${exp.id}`);
      continue;
    }

    const oldId = exp.id;
    let newId = generateTransactionTrackingId(exp.transactionType);
    let exists = await prisma.expense.findUnique({ where: { id: newId } });
    while (exists) {
      newId = generateTransactionTrackingId(exp.transactionType);
      exists = await prisma.expense.findUnique({ where: { id: newId } });
    }

    console.log(`Migrating [${exp.transactionType}] "${exp.description || 'No note'}": ${oldId} -> ${newId}`);

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('PRAGMA foreign_keys = OFF;');
      // 1. Update Expense primary key
      await tx.$executeRawUnsafe('UPDATE "Expense" SET id = ? WHERE id = ?;', newId, oldId);
      // 2. Update _ExpenseToTag join table (A is Expense.id)
      await tx.$executeRawUnsafe('UPDATE "_ExpenseToTag" SET A = ? WHERE A = ?;', newId, oldId);
      await tx.$executeRawUnsafe('PRAGMA foreign_keys = ON;');
    });

    migratedExpensesCount++;
  }

  console.log(`Migrated ${migratedExpensesCount} expense/income/transfer record(s).`);

  // 3. Migrate Investment / Asset records (ASSET -> A)
  const investments = await prisma.investment.findMany({
    select: { id: true, name: true, code: true }
  });
  console.log(`Found ${investments.length} total investment record(s) in database.`);

  let migratedInvestmentsCount = 0;
  const investmentIdRegex = /^A[0-9A-Z]{9}$/;

  for (const inv of investments) {
    const isAlreadyMigrated = investmentIdRegex.test(inv.id);
    if (isAlreadyMigrated) {
      console.log(`Asset "${inv.name}" (${inv.code}) already has valid tracking ID: ${inv.id}`);
      continue;
    }

    const oldId = inv.id;
    let newId = generateTransactionTrackingId('ASSET');
    while (await prisma.investment.findUnique({ where: { id: newId } })) {
      newId = generateTransactionTrackingId('ASSET');
    }

    console.log(`Migrating Asset "${inv.name}" (${inv.code}): ${oldId} -> ${newId}`);

    await prisma.$transaction(async (tx) => {
      const full = await tx.investment.findUniqueOrThrow({ where: { id: oldId } });
      await tx.investment.create({
        data: {
          id: newId,
          code: full.code,
          name: full.name,
          type: full.type,
          units: full.units,
          buyPrice: full.buyPrice,
          currentPrice: full.currentPrice,
          color: full.color,
          date: full.date,
          userId: full.userId,
          createdAt: full.createdAt,
          updatedAt: full.updatedAt
        }
      });
      await tx.investmentTransaction.updateMany({
        where: { investmentId: oldId },
        data: { investmentId: newId }
      });
      await tx.investment.delete({ where: { id: oldId } });
    });

    migratedInvestmentsCount++;
  }

  console.log(`Migrated ${migratedInvestmentsCount} investment record(s).`);

  // 4. Migrate Group records (GROUP -> G)
  const groups = await prisma.group.findMany({
    select: { id: true, name: true, createdAt: true, ownerId: true }
  });
  console.log(`Found ${groups.length} total group record(s) in database.`);

  let migratedGroupsCount = 0;
  const groupIdRegex = /^G[0-9A-Z]{9}$/;

  for (const grp of groups) {
    const isAlreadyMigrated = groupIdRegex.test(grp.id);
    if (isAlreadyMigrated) {
      console.log(`Group "${grp.name}" already has valid tracking ID: ${grp.id}`);
      continue;
    }

    const oldId = grp.id;
    let newId = generateTransactionTrackingId('GROUP');
    while (await prisma.group.findUnique({ where: { id: newId } })) {
      newId = generateTransactionTrackingId('GROUP');
    }

    console.log(`Migrating Group "${grp.name}": ${oldId} -> ${newId}`);

    await prisma.$transaction(async (tx) => {
      await tx.group.create({
        data: {
          id: newId,
          name: grp.name,
          createdAt: grp.createdAt,
          ownerId: grp.ownerId
        }
      });
      await tx.invitation.updateMany({
        where: { groupId: oldId },
        data: { groupId: newId }
      });
      await tx.$executeRawUnsafe('UPDATE "_GroupMembers" SET A = ? WHERE A = ?;', newId, oldId);
      await tx.group.delete({ where: { id: oldId } });
    });

    migratedGroupsCount++;
  }

  console.log(`Migrated ${migratedGroupsCount} group record(s).`);

  // 5. Verify post-migration integrity
  console.log('\n--- Verifying Database Integrity ---');
  const allExpenses = await prisma.expense.findMany({
    select: { id: true, transactionType: true }
  });
  const invalidExpenses = allExpenses.filter((e) => !trackingIdRegex.test(e.id));
  if (invalidExpenses.length > 0) {
    throw new Error(`Integrity check failed: ${invalidExpenses.length} expense(s) have invalid tracking IDs!`);
  }

  const allInvestments = await prisma.investment.findMany({
    select: { id: true }
  });
  const invalidInvestments = allInvestments.filter((i) => !investmentIdRegex.test(i.id));
  if (invalidInvestments.length > 0) {
    throw new Error(`Integrity check failed: ${invalidInvestments.length} investment(s) have invalid tracking IDs!`);
  }

  const allGroups = await prisma.group.findMany({
    select: { id: true }
  });
  const invalidGroups = allGroups.filter((g) => !groupIdRegex.test(g.id));
  if (invalidGroups.length > 0) {
    throw new Error(`Integrity check failed: ${invalidGroups.length} group(s) have invalid tracking IDs!`);
  }

  // Verify tags relation works
  const expenseWithTags = await prisma.expense.findFirst({
    where: { tags: { some: {} } },
    include: { tags: true }
  });
  console.log('Sample expense with tags verified:', expenseWithTags ? { id: expenseWithTags.id, tags: expenseWithTags.tags.map(t => t.name) } : 'None');

  console.log('All transactions, assets, and groups successfully verified with unique tracking IDs!');
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
