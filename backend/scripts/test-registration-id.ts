import { PrismaClient } from '@prisma/client';
import { UsersService } from '../src/users/users.service';

const prisma = new PrismaClient();
const usersService = new UsersService(prisma as any);

async function main() {
  console.log('=== Verifying New User Registration ID Format ===');
  const rand = Math.floor(100000 + Math.random() * 900000);
  const testEmail = `newuser_${Date.now()}@test.com`;
  const testPhone = `+919999${rand}`;

  const createdUser = await usersService.createUser({
    name: 'Auto Verified User',
    email: testEmail,
    phoneNumber: testPhone,
    passwordHash: 'testHash123'
  });

  console.log('Created User Result:', createdUser);
  console.log('User ID:', createdUser.id);
  console.log('Is exactly 10 digits:', /^\d{10}$/.test(createdUser.id));

  // Verify finding by ID
  const found = await usersService.findById(createdUser.id);
  console.log('Found by ID:', found ? found.id === createdUser.id : false);

  // Clean up
  await prisma.user.delete({ where: { id: createdUser.id } });
  console.log('Test User cleanup completed successfully.');

  console.log('\n=== Verifying All Existing Users in Database ===');
  const allUsers = await prisma.user.findMany();
  for (const u of allUsers) {
    console.log(`- User "${u.name}" (${u.email}): ID = ${u.id} (10-digit check: ${/^\d{10}$/.test(u.id)})`);
  }
}

main()
  .catch((e) => {
    console.error('Test error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
