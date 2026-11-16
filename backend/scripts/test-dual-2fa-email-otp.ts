import * as assert from 'assert';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../src/auth/auth.service';
import { UsersService } from '../src/users/users.service';
import { EmailService } from '../src/email/email.service';
import { EmailProviderInterface, EmailSendResult, SendMailParams } from '../src/email/interfaces/email-provider.interface';
import { generateTotpSecret, generateRecoveryCodes, verifyTotpCode } from '../src/common/utils/totp.util';

// Mock Email Provider to capture dispatched 2FA OTP emails
class MockEmailProvider implements EmailProviderInterface {
  readonly name = 'resend' as const;
  public sentEmails: SendMailParams[] = [];

  async sendEmail(params: SendMailParams): Promise<EmailSendResult> {
    this.sentEmails.push(params);
    return {
      success: true,
      messageId: `mock_email_${Date.now()}_${Math.random().toString(36).substring(2)}`,
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

async function runDual2faTests() {
  console.log('================================================================');
  console.log('   CASHFLOW DUAL 2FA VERIFICATION TEST SUITE (TOTP + EMAIL OTP)  ');
  console.log('================================================================\n');

  const prisma = new PrismaClient();
  const mockEmailProvider = new MockEmailProvider();
  const configService = new ConfigService({
    JWT_SECRET: 'test_jwt_secret_key_minimum_32_characters_long_12345',
    JWT_EXPIRES_IN: '7d',
    BCRYPT_ROUNDS: '10'
  });
  const jwtService = new JwtService({
    secret: 'test_jwt_secret_key_minimum_32_characters_long_12345',
    signOptions: { expiresIn: '7d' }
  });
  const usersService = new UsersService(prisma as any);
  const emailService = new EmailService(mockEmailProvider, configService);
  const authService = new AuthService(usersService, jwtService, configService, prisma as any, emailService);

  // Initialize service & ensure schema
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

  const ts = Date.now();
  const passwordPlain = 'SecurePass123!';
  const passwordHash = await bcrypt.hash(passwordPlain, 10);

  // Create isolated test user
  const user = await prisma.user.create({
    data: {
      name: 'Dual 2FA Tester',
      email: `dual2fa_${ts}@test.com`,
      phoneNumber: `+9198${Math.floor(10000000 + Math.random() * 90000000)}`,
      passwordHash,
      twoFactorEnabled: false,
      emailOtpEnabled: false
    }
  });

  try {
    // -------------------------------------------------------------------------
    // Test 1: Standard login when both 2FA methods are OFF
    // -------------------------------------------------------------------------
    await test('Standard login succeeds directly when both 2FA methods are disabled', async () => {
      const result: any = await authService.login({ email: user.email, password: passwordPlain });
      assert.strictEqual(result.requires2FA, undefined);
      assert.ok(result.accessToken, 'Access token provided');
      assert.strictEqual(result.user.email, user.email);
    });

    // -------------------------------------------------------------------------
    // Test 2: Enable Email OTP 2FA via Settings Flow
    // -------------------------------------------------------------------------
    await test('Setup Email 2FA generates OTP and dispatches security email', async () => {
      mockEmailProvider.clear();
      const setupRes = await authService.setupEmail2fa(user.id);
      assert.strictEqual(setupRes.success, true);

      // Verify email was sent via EmailService
      const email = mockEmailProvider.getLastEmail();
      assert.ok(email, 'Email was dispatched');
      assert.strictEqual(email.to, user.email);
      assert.ok(email.subject.includes('Your CashFlow 2FA Setup Code:'));

      // Extract the 6-digit code from subject or body
      const codeMatch = email.subject.match(/\b\d{6}\b/);
      assert.ok(codeMatch, '6-digit OTP code found in subject');
      const otpCode = codeMatch[0];

      // Enable Email 2FA with the code
      const enableRes = await authService.enableEmail2fa(user.id, otpCode);
      assert.strictEqual(enableRes.success, true);

      // Check status
      const status = await authService.get2faStatus(user.id);
      assert.strictEqual(status.enabled, true);
      assert.strictEqual(status.emailOtpEnabled, true);
      assert.strictEqual(status.totpEnabled, false);
    });

    // -------------------------------------------------------------------------
    // Test 3: Login with Email OTP only
    // -------------------------------------------------------------------------
    await test('Login with Email OTP only auto-dispatches OTP and completes 2FA verification', async () => {
      mockEmailProvider.clear();
      const loginRes: any = await authService.login({ email: user.email, password: passwordPlain });

      assert.strictEqual(loginRes.requires2FA, true);
      assert.strictEqual(loginRes.defaultMethod, 'email');
      assert.deepStrictEqual(loginRes.availableMethods, ['email']);
      assert.ok(loginRes.tempToken);

      // Verify login OTP email was dispatched automatically
      const email = mockEmailProvider.getLastEmail();
      assert.ok(email, 'Login OTP email dispatched');
      assert.ok(email.subject.includes('Your CashFlow Login Verification Code:'));
      const codeMatch = email.subject.match(/\b\d{6}\b/);
      assert.ok(codeMatch, '6-digit code found in login email');
      const otp = codeMatch[0];

      // Verify with incorrect code fails
      await assert.rejects(
        () => authService.verify2faLogin(loginRes.tempToken!, '000000', 'email'),
        (err: any) => err.message.includes('Invalid verification code')
      );

      // Verify with correct code succeeds
      const verifyRes: any = await authService.verify2faLogin(loginRes.tempToken!, otp, 'email');
      assert.ok(verifyRes.accessToken, 'Access token issued');
      assert.strictEqual(verifyRes.user.email, user.email);
    });

    // -------------------------------------------------------------------------
    // Test 4: Enable Authenticator (TOTP) so BOTH 2FA methods are active
    // -------------------------------------------------------------------------
    let totpSecret = '';
    await test('Enable Authenticator App 2FA alongside Email OTP (Both Active)', async () => {
      const setup = await authService.setup2fa(user.id);
      assert.ok(setup.secret);
      totpSecret = setup.secret;

      // In tests, we can manually set the totp secret to enable it
      const { plainCodes, hashedCodes } = generateRecoveryCodes(8);
      await prisma.user.update({
        where: { id: user.id },
        data: {
          twoFactorEnabled: true,
          twoFactorSecret: totpSecret,
          twoFactorTempSecret: null,
          twoFactorRecoveryCodes: JSON.stringify(hashedCodes)
        }
      });

      const status = await authService.get2faStatus(user.id);
      assert.strictEqual(status.enabled, true);
      assert.strictEqual(status.totpEnabled, true);
      assert.strictEqual(status.emailOtpEnabled, true);
      assert.strictEqual(status.remainingRecoveryCodes, 8);
    });

    // -------------------------------------------------------------------------
    // Test 5: Login with Both Methods Available (Switching & Verification)
    // -------------------------------------------------------------------------
    await test('Login with both methods active lists totp and email, allows either method', async () => {
      mockEmailProvider.clear();
      const loginRes: any = await authService.login({ email: user.email, password: passwordPlain });

      assert.strictEqual(loginRes.requires2FA, true);
      assert.deepStrictEqual(loginRes.availableMethods, ['totp', 'email']);
      assert.strictEqual(loginRes.defaultMethod, 'totp');
      assert.ok(loginRes.tempToken);

      // User switches to Email OTP and requests code
      const sendRes = await authService.sendLoginEmailOtp(loginRes.tempToken!);
      assert.strictEqual(sendRes.success, true);

      const email = mockEmailProvider.getLastEmail();
      assert.ok(email, 'Email sent upon request');
      const otp = email.subject.match(/\b\d{6}\b/)![0];

      // Verifying with email OTP completes login
      const verifyEmailRes: any = await authService.verify2faLogin(loginRes.tempToken!, otp, 'email');
      assert.ok(verifyEmailRes.accessToken);
    });

    // -------------------------------------------------------------------------
    // Test 6: Disable Email OTP in Settings, keeping Authenticator active
    // -------------------------------------------------------------------------
    await test('Disable Email OTP retains Authenticator App active', async () => {
      // Wrong password fails
      await assert.rejects(
        () => authService.disableEmail2fa(user.id, 'WrongPassword'),
        (err: any) => err.message.includes('Security verification failed')
      );

      // Correct password succeeds
      const disableRes = await authService.disableEmail2fa(user.id, passwordPlain);
      assert.strictEqual(disableRes.success, true);

      const status = await authService.get2faStatus(user.id);
      assert.strictEqual(status.enabled, true);
      assert.strictEqual(status.totpEnabled, true);
      assert.strictEqual(status.emailOtpEnabled, false);
    });

    // -------------------------------------------------------------------------
    // Test 7: Disable Authenticator in Settings (Both now OFF)
    // -------------------------------------------------------------------------
    await test('Disable Authenticator App returns account to single-factor', async () => {
      const disableRes = await authService.disable2fa(user.id, passwordPlain);
      assert.strictEqual(disableRes.success, true);

      const status = await authService.get2faStatus(user.id);
      assert.strictEqual(status.enabled, false);
      assert.strictEqual(status.totpEnabled, false);
      assert.strictEqual(status.emailOtpEnabled, false);

      // Standard login works directly
      const loginRes: any = await authService.login({ email: user.email, password: passwordPlain });
      assert.strictEqual(loginRes.requires2FA, undefined);
      assert.ok(loginRes.accessToken);
    });

  } finally {
    // Clean up test user
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    await prisma.$disconnect();
  }

  console.log('\n================================================================');
  console.log(`   TEST RESULTS: ${passed}/${total} PASSED (${Math.round((passed / total) * 100)}%)`);
  console.log('================================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runDual2faTests().catch((err) => {
  console.error('Fatal dual 2FA test error:', err);
  process.exit(1);
});
