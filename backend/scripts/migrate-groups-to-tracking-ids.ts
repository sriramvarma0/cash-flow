import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { generateGroupTrackingId } from '../src/common/utils/uuid7.util';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Migrating Group IDs to "G" Prefix + 9-Digit Alphanumeric UUIDv7 ===');

  // 1. Create a safe database backup
  const dbPath = path.resolve(__dirname, '../../data/dev.db');
  const backupPath = path.resolve(__dirname, '../../data/dev.db.bak_pre_group_tracking_id');
  if (fs.existsSync(dbPath)) {
    fs.copyFileSync(dbPath, backupPath);
    console.log(`Created database backup at: ${backupPath}`);
  }

  // 2. Fetch all groups
  const groups = await prisma.group.findMany({
    include: { members: true, invitations: true }
  });
  console.log(`Found ${groups.length} total group(s) in database.`);

  const groupTrackingIdRegex = /^G[0-9A-Z]{9}$/;
  let migratedCount = 0;

  for (const group of groups) {
    if (groupTrackingIdRegex.test(group.id)) {
      console.log(`Group "${group.name}" already has valid tracking ID: ${group.id}`);
      continue;
    }

    const oldId = group.id;
    let newId = generateGroupTrackingId();
    while (await prisma.group.findUnique({ where: { id: newId } })) {
      newId = generateGroupTrackingId();
    }

    console.log(`Migrating group "${group.name}": ${oldId} -> ${newId}`);

    await prisma.$transaction(async (tx) => {
      // 1. Create duplicate Group row with newId
      await tx.group.create({
        data: {
          id: newId,
          name: group.name,
          createdAt: group.createdAt,
          ownerId: group.ownerId
        }
      });

      // 2. Update Invitations foreign key
      await tx.invitation.updateMany({
        where: { groupId: oldId },
        data: { groupId: newId }
      });

      // 3. Update _GroupMembers join table (A is Group.id)
      await tx.$executeRawUnsafe('UPDATE "_GroupMembers" SET A = ? WHERE A = ?;', newId, oldId);

      // 4. Delete old Group row
      await tx.group.delete({
        where: { id: oldId }
      });
    });

    migratedCount++;
  }

  console.log(`\nSuccessfully migrated ${migratedCount} group(s) to 'G' + 9-character tracking IDs.`);

  // Verify relations and integrity
  const verified = await prisma.group.findMany({
    include: { members: true, invitations: true, owner: true }
  });
  console.log('\n--- Verification ---');
  for (const v of verified) {
    console.log(`Group: [${v.id}] "${v.name}" (Owner: ${v.owner.name}) -> ${v.members.length} member(s), ${v.invitations.length} invitation(s)`);
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
