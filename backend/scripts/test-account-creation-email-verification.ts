import * as assert from 'assert';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../src/auth/auth.service';
import { UsersService } from '../src/users/users.service';
import { EmailService } from '../src/email/email.service';
import {
  EmailProviderInterface,
  EmailSendResult,
  SendMailParams
} from '../src/email/interfaces/email-provider.interface';

// Mock Email Provider to capture dispatched account verification emails
class MockEmailProvider implements EmailProviderInterface {
  readonly name = 'resend' as const;
  public sentEmails: SendMailParams[] = [];

  async sendEmail(params: SendMailParams): Promise<EmailSendResult> {
    this.sentEmails.push(params);
    return {
      success: true,
      messageId: `mock_verify_${Date.now()}_${Math.random().toString(36).substring(2)}`,
      provider: 'resend',
      timestamp: new Date()
    };
  }

  getLastEmail(): SendMailParams | undefined {
    return this.sentEmails[this.sentEmails.length - 1];
  }

  clear() {
    this.sentEmails = [];
  }
}

async function runEmailVerificationTests() {
  console.log('================================================================');
  console.log('   CASHFLOW SIGNUP EMAIL VERIFICATION INTEGRATION TEST SUITE    ');
  console.log('================================================================\n');

  const prisma = new PrismaClient();
  const mockEmailProvider = new MockEmailProvider();
  const configService = new ConfigService({
    JWT_SECRET: 'test_jwt_secret_key_minimum_32_characters_long_12345',
    JWT_EXPIRES_IN: '7d',
    BCRYPT_ROUNDS: '10',
    FRONTEND_URL: 'http://localhost:3000'
  });
  const jwtService = new JwtService({
    secret: 'test_jwt_secret_key_minimum_32_characters_long_12345',
    signOptions: { expiresIn: '7d' }
  });
  const usersService = new UsersService(prisma as any);
  const emailService = new EmailService(mockEmailProvider, configService);
  const authService = new AuthService(usersService, jwtService, configService, prisma as any, emailService);

  await authService.onModuleInit();

  let passed = 0;
  let total = 0;

  async function test(name: string, fn: () => Promise<void>) {
    total++;
    try {
      await fn();
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  [FAIL] ${name}`);
      console.error(`         Error: ${err.message}`);
      if (err.stack) {
        console.error(`         Stack: ${err.stack.split('\n').slice(1, 4).join('\n')}`);
      }
    }
  }

  const testSuffix = Date.now().toString().slice(-6);
  const testEmail1 = `verify_user1_${testSuffix}@test.com`;
  const testPhone1 = `+1900${testSuffix}`;
  const testEmail2 = `verify_user2_${testSuffix}@test.com`;
  const testPhone2 = `+1901${testSuffix}`;
  const testEmail3 = `verify_user3_${testSuffix}@test.com`;
  const testPhone3 = `+1902${testSuffix}`;
  const testEmailLegacy = `legacy_user_${testSuffix}@test.com`;
  const testPhoneLegacy = `+1903${testSuffix}`;
  const testPass = 'SecureP@ssw0rd123!';

  let regResult1: any;
  let sentCode1: string = '';
  let sentToken1: string = '';

  try {
    // -------------------------------------------------------------------------
    // Test 1: Account creation requires email verification and dispatches email
    // -------------------------------------------------------------------------
    await test('Registration requires email verification & dispatches 6-digit code', async () => {
      mockEmailProvider.clear();
      regResult1 = await authService.register({
        name: 'Verify User One',
        email: testEmail1,
        phoneNumber: testPhone1,
        password: testPass
      });

      assert.strictEqual(regResult1.requiresVerification, true, 'Must require email verification');
      assert.strictEqual(typeof regResult1.tempToken, 'string', 'Must issue tempToken');
      assert.strictEqual(regResult1.accessToken, undefined, 'Must NOT issue accessToken directly');
      assert.ok(regResult1.maskedEmail.includes('***'), 'Must provide masked email');

      // Check user in database
      const dbUser = await prisma.user.findUnique({ where: { email: testEmail1 } });
      assert.ok(dbUser, 'User must exist in DB');
      assert.strictEqual(dbUser.isEmailVerified, false, 'isEmailVerified must be false');
      assert.ok(dbUser.emailVerifyCode, 'emailVerifyCode must be generated');
      assert.ok(dbUser.emailVerifyToken, 'emailVerifyToken must be generated');
      assert.ok(dbUser.emailVerifyExpiresAt, 'emailVerifyExpiresAt must be set');

      // Check dispatched email
      const lastEmail = mockEmailProvider.getLastEmail();
      assert.ok(lastEmail, 'Email must have been dispatched');
      assert.strictEqual(lastEmail.to, testEmail1);
      assert.strictEqual(lastEmail.subject, 'Verify your CashFlow account');
      assert.ok(lastEmail.html?.includes(dbUser.emailVerifyCode!), 'HTML must contain 6-digit code');
      assert.ok(lastEmail.html?.includes('/verify-email?token='), 'HTML must contain verify URL');

      sentCode1 = dbUser.emailVerifyCode!;
      sentToken1 = dbUser.emailVerifyToken!;
    });

    // -------------------------------------------------------------------------
    // Test 2: Unverified user cannot log in
    // -------------------------------------------------------------------------
    await test('Login is intercepted for unverified account', async () => {
      const loginResult: any = await authService.login({
        email: testEmail1,
        password: testPass
      });

      assert.strictEqual(loginResult.requiresVerification, true, 'Login must require verification');
      assert.strictEqual(loginResult.accessToken, undefined, 'No accessToken for unverified login');
      assert.ok(loginResult.tempToken, 'Must provide tempToken to complete verification');
    });

    // -------------------------------------------------------------------------
    // Test 3: Verification with invalid code fails
    // -------------------------------------------------------------------------
    await test('Verification with wrong code is rejected', async () => {
      await assert.rejects(
        async () => {
          await authService.verifyEmail({
            tempToken: regResult1.tempToken,
            code: '999999' // incorrect code
          });
        },
        (err: any) => err.message.includes('Invalid verification code')
      );
    });

    // -------------------------------------------------------------------------
    // Test 4: Verification with correct 6-digit code activates account
    // -------------------------------------------------------------------------
    await test('Verification with correct 6-digit code activates account and issues token', async () => {
      const verifyResult: any = await authService.verifyEmail({
        tempToken: regResult1.tempToken,
        code: sentCode1
      });

      assert.ok(verifyResult.accessToken, 'Must return accessToken on successful verification');
      assert.strictEqual(verifyResult.user.email, testEmail1);
      assert.strictEqual(verifyResult.user.isEmailVerified, true);

      // Verify in DB
      const dbUser = await prisma.user.findUnique({ where: { email: testEmail1 } });
      assert.strictEqual(dbUser?.isEmailVerified, true, 'DB isEmailVerified must now be true');
      assert.strictEqual(dbUser?.emailVerifyCode, null, 'emailVerifyCode must be cleared');
      assert.strictEqual(dbUser?.emailVerifyToken, null, 'emailVerifyToken must be cleared');
    });

    // -------------------------------------------------------------------------
    // Test 5: Subsequent login succeeds directly
    // -------------------------------------------------------------------------
    await test('Subsequent login succeeds directly for verified user', async () => {
      const loginResult: any = await authService.login({
        email: testEmail1,
        password: testPass
      });

      assert.ok(loginResult.accessToken, 'Must issue accessToken directly');
      assert.strictEqual(loginResult.user.email, testEmail1);
      assert.strictEqual(loginResult.requiresVerification, undefined);
    });

    // -------------------------------------------------------------------------
    // Test 6: Direct verification via email link token
    // -------------------------------------------------------------------------
    await test('Verification via email link token activates account', async () => {
      mockEmailProvider.clear();
      await authService.register({
        name: 'Verify User Two',
        email: testEmail2,
        phoneNumber: testPhone2,
        password: testPass
      });

      const dbUser2 = await prisma.user.findUnique({ where: { email: testEmail2 } });
      assert.ok(dbUser2?.emailVerifyToken, 'User 2 must have token');
      assert.strictEqual(dbUser2?.isEmailVerified, false);

      const verifyResult: any = await authService.verifyEmail({
        token: dbUser2.emailVerifyToken!
      });

      assert.ok(verifyResult.accessToken, 'Must return accessToken');
      assert.strictEqual(verifyResult.user.isEmailVerified, true);

      const updatedUser2 = await prisma.user.findUnique({ where: { email: testEmail2 } });
      assert.strictEqual(updatedUser2?.isEmailVerified, true);
    });

    // -------------------------------------------------------------------------
    // Test 7: Resend verification code generates new OTP and sends email
    // -------------------------------------------------------------------------
    await test('Resend verification code generates fresh OTP and dispatches email', async () => {
      mockEmailProvider.clear();
      const reg3: any = await authService.register({
        name: 'Verify User Three',
        email: testEmail3,
        phoneNumber: testPhone3,
        password: testPass
      });

      const initialUser3 = await prisma.user.findUnique({ where: { email: testEmail3 } });
      const initialCode = initialUser3?.emailVerifyCode;

      mockEmailProvider.clear();
      const resendResult = await authService.resendVerification({
        tempToken: reg3.tempToken
      });

      assert.strictEqual(resendResult.success, true);
      assert.ok(resendResult.message.includes('verification code'));

      const lastEmail = mockEmailProvider.getLastEmail();
      assert.ok(lastEmail, 'Email must have been re-dispatched');
      assert.strictEqual(lastEmail.to, testEmail3);

      const refreshedUser3 = await prisma.user.findUnique({ where: { email: testEmail3 } });
      assert.ok(refreshedUser3?.emailVerifyCode, 'Must have new code');

      // Verify account with the new code
      const verifyResult: any = await authService.verifyEmail({
        email: testEmail3,
        code: refreshedUser3!.emailVerifyCode!
      });

      assert.ok(verifyResult.accessToken, 'Account 3 activated');
      assert.strictEqual(verifyResult.user.isEmailVerified, true);
    });

    // -------------------------------------------------------------------------
    // Test 8: Backward compatibility - existing verified accounts log in directly
    // -------------------------------------------------------------------------
    await test('Legacy existing accounts (default verified) log in with zero friction', async () => {
      const passwordHash = await bcrypt.hash(testPass, 10);
      await prisma.user.create({
        data: {
          id: `legacy_${Date.now()}`,
          name: 'Legacy User',
          email: testEmailLegacy,
          phoneNumber: testPhoneLegacy,
          passwordHash,
          isEmailVerified: true // existing legacy user
        }
      });

      const loginResult: any = await authService.login({
        email: testEmailLegacy,
        password: testPass
      });

      assert.ok(loginResult.accessToken, 'Legacy user gets accessToken directly');
      assert.strictEqual(loginResult.requiresVerification, undefined);
    });
  } finally {
    // Cleanup created test users
    try {
      await prisma.user.deleteMany({
        where: {
          email: {
            in: [testEmail1, testEmail2, testEmail3, testEmailLegacy]
          }
        }
      });
    } catch {}
    await prisma.$disconnect();
  }

  console.log('\n================================================================');
  console.log(`   TEST RESULTS: ${passed}/${total} PASSED (${Math.round((passed / total) * 100)}%)`);
  console.log('================================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runEmailVerificationTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
