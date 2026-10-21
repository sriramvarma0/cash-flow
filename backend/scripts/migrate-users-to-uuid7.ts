import { PrismaClient } from '@prisma/client';
import { generateNumericUuidV7 } from '../src/common/utils/uuid7.util';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Checking & Migrating User IDs to Numeric UUIDv7 ---');

  // Find all users
  const users = await prisma.user.findMany();
  console.log(`Found ${users.length} user(s) in database.`);

  let migratedCount = 0;

  for (const user of users) {
    // Check if ID is already an exact 10-digit numeric string
    const isAlready10Digit = /^\d{10}$/.test(user.id);
    if (isAlready10Digit) {
      console.log(`User "${user.name}" (${user.email}) already has 10-digit numeric ID: ${user.id}`);
      continue;
    }

    const oldId = user.id;
    let newId = generateNumericUuidV7(10);
    let exists = await prisma.user.findUnique({ where: { id: newId } });
    while (exists) {
      newId = generateNumericUuidV7(10);
      exists = await prisma.user.findUnique({ where: { id: newId } });
    }

    console.log(`Migrating User "${user.name}" (${user.email}): ${oldId} -> ${newId} (10 digits)`);

    // Execute atomic raw updates with foreign key integrity
    await prisma.$transaction(async (tx) => {
      // Temporarily disable foreign keys for cascading update
      await tx.$executeRawUnsafe('PRAGMA foreign_keys = OFF;');

      // 1. Update User table
      await tx.$executeRawUnsafe('UPDATE "User" SET id = ? WHERE id = ?;', newId, oldId);

      // 2. Update Expense.userId (owner)
      await tx.$executeRawUnsafe('UPDATE "Expense" SET userId = ? WHERE userId = ?;', newId, oldId);

      // 3. Update Expense.toUserId (recipient)
      await tx.$executeRawUnsafe('UPDATE "Expense" SET toUserId = ? WHERE toUserId = ?;', newId, oldId);

      // 4. Update Group.ownerId
      await tx.$executeRawUnsafe('UPDATE "Group" SET ownerId = ? WHERE ownerId = ?;', newId, oldId);

      // 5. Update _GroupMembers join table (B is userId)
      try {
        await tx.$executeRawUnsafe('UPDATE "_GroupMembers" SET B = ? WHERE B = ?;', newId, oldId);
      } catch (err) {
        // Table might not exist if no group members yet
      }

      // 6. Update Tag.userId
      await tx.$executeRawUnsafe('UPDATE "Tag" SET userId = ? WHERE userId = ?;', newId, oldId);

      // 7. Update Investment.userId
      await tx.$executeRawUnsafe('UPDATE "Investment" SET userId = ? WHERE userId = ?;', newId, oldId);

      // Re-enable foreign keys and verify integrity
      await tx.$executeRawUnsafe('PRAGMA foreign_keys = ON;');
    });

    migratedCount++;
  }

  console.log(`Migration complete. Migrated ${migratedCount} user(s) to numeric UUIDv7.`);
}

main()
  .catch((e) => {
    console.error('Migration error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
