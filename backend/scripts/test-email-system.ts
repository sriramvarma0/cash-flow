import * as assert from 'assert';
import { ConfigService } from '@nestjs/config';
import {
  EmailConfigurationException,
  EmailDeliveryException,
  EmailProviderInterface,
  EmailSendResult,
  EmailValidationException,
  SendMailParams
} from '../src/email/interfaces/email-provider.interface';
import { validateEmailConfig } from '../src/email/config/email.config';
import { GmailProvider } from '../src/email/providers/gmail.provider';
import { ResendProvider } from '../src/email/providers/resend.provider';
import { EmailService } from '../src/email/email.service';
import {
  accountVerificationTemplate,
  passwordResetTemplate,
  groupInvitationTemplate,
  transactionNotificationTemplate,
  accountNotificationTemplate
} from '../src/email/templates';

// Helper mock ConfigService
function createMockConfig(env: Record<string, string>): ConfigService {
  return {
    get: (key: string, defaultValue?: any) => {
      return env[key] !== undefined ? env[key] : defaultValue;
    }
  } as unknown as ConfigService;
}

// Global fetch mock helper
type FetchHandler = (url: string, init?: any) => Promise<any>;
let currentFetchHandler: FetchHandler | null = null;
const originalFetch = global.fetch;

function mockFetch(handler: FetchHandler) {
  currentFetchHandler = handler;
  global.fetch = async (input: any, init?: any): Promise<any> => {
    const urlStr = typeof input === 'string' ? input : input.toString();
    if (currentFetchHandler) {
      return currentFetchHandler(urlStr, init);
    }
    throw new Error(`Unhandled fetch mock for: ${urlStr}`);
  };
}

function restoreFetch() {
  currentFetchHandler = null;
  global.fetch = originalFetch;
}

async function runTestSuite() {
  console.log('================================================================');
  console.log('   CASHFLOW DUAL EMAIL PROVIDER VERIFICATION TEST SUITE         ');
  console.log('================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  async function test(name: string, fn: () => Promise<void>) {
    totalTests++;
    try {
      await fn();
      console.log(`  [PASS] ${name}`);
      passedTests++;
    } catch (err: any) {
      console.error(`  [FAIL] ${name}`);
      console.error(`         Error: ${err.message}`);
      if (err.stack) {
        console.error(`         Stack: ${err.stack.split('\n').slice(1, 4).join('\n')}`);
      }
    }
  }

  try {
    // =========================================================================
    // Category 1: Email Configuration Validation & Missing Environment Variables
    // =========================================================================
    console.log('\n--- 1. Email Configuration & Missing Variables ---');

    await test('Should throw when EMAIL_PROVIDER is missing', async () => {
      assert.throws(
        () => validateEmailConfig({}),
        (err: any) =>
          err instanceof EmailConfigurationException &&
          err.message.includes('Missing required environment variable: EMAIL_PROVIDER')
      );
    });

    await test('Should throw when EMAIL_PROVIDER is invalid', async () => {
      assert.throws(
        () => validateEmailConfig({ EMAIL_PROVIDER: 'sendgrid' }),
        (err: any) =>
          err instanceof EmailConfigurationException &&
          err.message.includes('Invalid EMAIL_PROVIDER: "sendgrid"')
      );
    });

    await test('Should throw when EMAIL_PROVIDER=gmail but Gmail variables are missing', async () => {
      assert.throws(
        () => validateEmailConfig({ EMAIL_PROVIDER: 'gmail' }),
        (err: any) =>
          err instanceof EmailConfigurationException &&
          err.message.includes('GMAIL_USER') &&
          err.message.includes('GMAIL_CLIENT_ID') &&
          err.message.includes('GMAIL_CLIENT_SECRET') &&
          err.message.includes('GMAIL_REFRESH_TOKEN')
      );
    });

    await test('Should throw when GMAIL_USER format is invalid', async () => {
      assert.throws(
        () =>
          validateEmailConfig({
            EMAIL_PROVIDER: 'gmail',
            GMAIL_USER: 'invalid-email-format',
            GMAIL_CLIENT_ID: 'client_id_123',
            GMAIL_CLIENT_SECRET: 'secret_456',
            GMAIL_REFRESH_TOKEN: 'refresh_789'
          }),
        (err: any) =>
          err instanceof EmailConfigurationException &&
          err.message.includes('Invalid GMAIL_USER format')
      );
    });

    await test('Should successfully validate valid Gmail configuration', async () => {
      const config = validateEmailConfig({
        EMAIL_PROVIDER: 'gmail',
        GMAIL_USER: 'notifications@cashflow.dev',
        GMAIL_CLIENT_ID: 'client_id_123',
        GMAIL_CLIENT_SECRET: 'secret_456',
        GMAIL_REFRESH_TOKEN: 'refresh_789'
      });
      assert.strictEqual(config.provider, 'gmail');
      assert.strictEqual(config.gmail?.user, 'notifications@cashflow.dev');
      assert.strictEqual(config.gmail?.clientId, 'client_id_123');
    });

    await test('Should throw when EMAIL_PROVIDER=resend but Resend variables are missing', async () => {
      assert.throws(
        () => validateEmailConfig({ EMAIL_PROVIDER: 'resend' }),
        (err: any) =>
          err instanceof EmailConfigurationException &&
          err.message.includes('RESEND_API_KEY') &&
          err.message.includes('EMAIL_FROM')
      );
    });

    await test('Should throw when EMAIL_FROM format is invalid', async () => {
      assert.throws(
        () =>
          validateEmailConfig({
            EMAIL_PROVIDER: 'resend',
            RESEND_API_KEY: 're_123456789',
            EMAIL_FROM: 'not-an-email'
          }),
        (err: any) =>
          err instanceof EmailConfigurationException &&
          err.message.includes('Invalid EMAIL_FROM format')
      );
    });

    await test('Should successfully validate valid Resend configuration with display name', async () => {
      const config = validateEmailConfig({
        EMAIL_PROVIDER: 'resend',
        RESEND_API_KEY: 're_123456789',
        EMAIL_FROM: 'CashFlow Notifications <notifications@cashflow.dev>'
      });
      assert.strictEqual(config.provider, 'resend');
      assert.strictEqual(config.resend?.apiKey, 're_123456789');
      assert.strictEqual(config.resend?.from, 'CashFlow Notifications <notifications@cashflow.dev>');
    });

    // =========================================================================
    // Category 2: Provider Selection
    // =========================================================================
    console.log('\n--- 2. Provider Selection ---');

    await test('Should select GmailProvider when EMAIL_PROVIDER=gmail', async () => {
      const gmailConfig = createMockConfig({
        EMAIL_PROVIDER: 'gmail',
        GMAIL_USER: 'user@gmail.com',
        GMAIL_CLIENT_ID: 'cid',
        GMAIL_CLIENT_SECRET: 'sec',
        GMAIL_REFRESH_TOKEN: 'ref'
      });
      const gmailProvider = new GmailProvider(gmailConfig);
      const emailService = new EmailService(gmailProvider, gmailConfig);

      assert.strictEqual(emailService.getActiveProviderName(), 'gmail');
    });

    await test('Should select ResendProvider when EMAIL_PROVIDER=resend', async () => {
      const resendConfig = createMockConfig({
        EMAIL_PROVIDER: 'resend',
        RESEND_API_KEY: 're_test',
        EMAIL_FROM: 'notifications@cashflow.dev'
      });
      const resendProvider = new ResendProvider(resendConfig);
      const emailService = new EmailService(resendProvider, resendConfig);

      assert.strictEqual(emailService.getActiveProviderName(), 'resend');
    });

    await test('Should handle case-insensitive EMAIL_PROVIDER selection', async () => {
      const config = validateEmailConfig({
        EMAIL_PROVIDER: 'GMAIL',
        GMAIL_USER: 'test@domain.com',
        GMAIL_CLIENT_ID: 'c',
        GMAIL_CLIENT_SECRET: 's',
        GMAIL_REFRESH_TOKEN: 'r'
      });
      assert.strictEqual(config.provider, 'gmail');

      const configResend = validateEmailConfig({
        EMAIL_PROVIDER: 'ReSenD',
        RESEND_API_KEY: 're_123',
        EMAIL_FROM: 'test@domain.com'
      });
      assert.strictEqual(configResend.provider, 'resend');
    });

    // =========================================================================
    // Category 3: Successful Email Delivery with Mocked APIs
    // =========================================================================
    console.log('\n--- 3. Successful Email Delivery (Mocked APIs) ---');

    await test('GmailProvider should exchange OAuth2 token and send RFC 2822 message', async () => {
      let oauthCalled = false;
      let sendCalled = false;
      let passedAuthorizationHeader = '';
      let passedRawPayload = '';

      mockFetch(async (url, init) => {
        if (url === 'https://oauth2.googleapis.com/token') {
          oauthCalled = true;
          return new Response(
            JSON.stringify({
              access_token: 'mock_access_token_xyz',
              expires_in: 3600,
              token_type: 'Bearer'
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        if (url.includes('gmail.googleapis.com/gmail/v1/users/')) {
          sendCalled = true;
          passedAuthorizationHeader = (init?.headers as any)?.Authorization || '';
          const bodyJson = JSON.parse(init?.body as string);
          passedRawPayload = bodyJson.raw;
          return new Response(
            JSON.stringify({
              id: 'gmail_msg_id_1001',
              threadId: 'thread_1001'
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        return new Response('Not found', { status: 404 });
      });

      try {
        const config = createMockConfig({
          GMAIL_USER: 'sender@cashflow.dev',
          GMAIL_CLIENT_ID: 'mock_client_id',
          GMAIL_CLIENT_SECRET: 'mock_client_secret',
          GMAIL_REFRESH_TOKEN: 'mock_refresh_token'
        });
        const provider = new GmailProvider(config);
        const result = await provider.sendEmail({
          to: 'recipient@example.com',
          subject: 'Test Subject',
          html: '<h1>Hello World</h1>',
          text: 'Hello World'
        });

        assert.strictEqual(oauthCalled, true, 'OAuth2 token endpoint was called');
        assert.strictEqual(sendCalled, true, 'Gmail send endpoint was called');
        assert.strictEqual(passedAuthorizationHeader, 'Bearer mock_access_token_xyz');
        assert.ok(passedRawPayload.length > 0, 'Raw RFC 2822 message payload was provided');
        assert.strictEqual(result.success, true);
        assert.strictEqual(result.messageId, 'gmail_msg_id_1001');
        assert.strictEqual(result.provider, 'gmail');
      } finally {
        restoreFetch();
      }
    });

    await test('GmailProvider should reuse cached access token on subsequent sends', async () => {
      let oauthCallCount = 0;

      mockFetch(async (url) => {
        if (url === 'https://oauth2.googleapis.com/token') {
          oauthCallCount++;
          return new Response(
            JSON.stringify({
              access_token: 'cached_token_abc',
              expires_in: 3600,
              token_type: 'Bearer'
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        if (url.includes('gmail.googleapis.com')) {
          return new Response(JSON.stringify({ id: 'msg_id_' + Date.now() }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        return new Response('Not found', { status: 404 });
      });

      try {
        const config = createMockConfig({
          GMAIL_USER: 'sender@cashflow.dev',
          GMAIL_CLIENT_ID: 'cid',
          GMAIL_CLIENT_SECRET: 'sec',
          GMAIL_REFRESH_TOKEN: 'ref'
        });
        const provider = new GmailProvider(config);

        await provider.sendEmail({
          to: 'user1@example.com',
          subject: 'Test 1',
          html: '<b>1</b>',
          text: '1'
        });

        await provider.sendEmail({
          to: 'user2@example.com',
          subject: 'Test 2',
          html: '<b>2</b>',
          text: '2'
        });

        assert.strictEqual(oauthCallCount, 1, 'OAuth2 token endpoint was called only once');
      } finally {
        restoreFetch();
      }
    });

    await test('ResendProvider should send email via POST https://api.resend.com/emails', async () => {
      let apiCalled = false;
      let passedAuthHeader = '';
      let passedPayload: any = null;

      mockFetch(async (url, init) => {
        if (url === 'https://api.resend.com/emails') {
          apiCalled = true;
          passedAuthHeader = (init?.headers as any)?.Authorization || '';
          passedPayload = JSON.parse(init?.body as string);
          return new Response(
            JSON.stringify({
              id: '49a3999c-0ce1-4ea6-ab68-afcd6dc2e794'
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        return new Response('Not found', { status: 404 });
      });

      try {
        const config = createMockConfig({
          RESEND_API_KEY: 're_custom_api_key_123',
          EMAIL_FROM: 'CashFlow <noreply@cashflow.dev>'
        });
        const provider = new ResendProvider(config);
        const result = await provider.sendEmail({
          to: 'customer@example.com',
          subject: 'Resend Test',
          html: '<p>Welcome</p>',
          text: 'Welcome'
        });

        assert.strictEqual(apiCalled, true);
        assert.strictEqual(passedAuthHeader, 'Bearer re_custom_api_key_123');
        assert.strictEqual(passedPayload.from, 'CashFlow <noreply@cashflow.dev>');
        assert.deepStrictEqual(passedPayload.to, ['customer@example.com']);
        assert.strictEqual(passedPayload.subject, 'Resend Test');
        assert.strictEqual(passedPayload.html, '<p>Welcome</p>');
        assert.strictEqual(passedPayload.text, 'Welcome');
        assert.strictEqual(result.success, true);
        assert.strictEqual(result.messageId, '49a3999c-0ce1-4ea6-ab68-afcd6dc2e794');
        assert.strictEqual(result.provider, 'resend');
      } finally {
        restoreFetch();
      }
    });

    // =========================================================================
    // Category 4: Provider API Failures & Error Handling
    // =========================================================================
    console.log('\n--- 4. Provider API Failures ---');

    await test('GmailProvider should throw EmailDeliveryException on OAuth2 failure', async () => {
      mockFetch(async () => {
        return new Response(
          JSON.stringify({
            error: 'invalid_grant',
            error_description: 'Bad Request: Token has been expired or revoked.'
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      });

      try {
        const config = createMockConfig({
          GMAIL_USER: 'user@gmail.com',
          GMAIL_CLIENT_ID: 'cid',
          GMAIL_CLIENT_SECRET: 'sec',
          GMAIL_REFRESH_TOKEN: 'bad_token'
        });
        const provider = new GmailProvider(config);

        await assert.rejects(
          async () =>
            provider.sendEmail({
              to: 'test@example.com',
              subject: 'Test',
              html: 'hi',
              text: 'hi'
            }),
          (err: any) => {
            assert.ok(err instanceof EmailDeliveryException);
            assert.strictEqual(err.provider, 'gmail');
            assert.strictEqual(err.statusCode, 400);
            assert.ok(err.message.includes('Token has been expired or revoked'));
            return true;
          }
        );
      } finally {
        restoreFetch();
      }
    });

    await test('GmailProvider should throw EmailDeliveryException on API send error', async () => {
      mockFetch(async (url) => {
        if (url === 'https://oauth2.googleapis.com/token') {
          return new Response(
            JSON.stringify({ access_token: 'token_ok', expires_in: 3600 }),
            { status: 200 }
          );
        }
        return new Response(
          JSON.stringify({
            error: {
              code: 403,
              message: 'Daily user sending quota exceeded.'
            }
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      });

      try {
        const config = createMockConfig({
          GMAIL_USER: 'user@gmail.com',
          GMAIL_CLIENT_ID: 'cid',
          GMAIL_CLIENT_SECRET: 'sec',
          GMAIL_REFRESH_TOKEN: 'ref'
        });
        const provider = new GmailProvider(config);

        await assert.rejects(
          async () =>
            provider.sendEmail({
              to: 'test@example.com',
              subject: 'Test',
              html: 'hi',
              text: 'hi'
            }),
          (err: any) => {
            assert.ok(err instanceof EmailDeliveryException);
            assert.strictEqual(err.statusCode, 403);
            assert.ok(err.message.includes('Daily user sending quota exceeded'));
            return true;
          }
        );
      } finally {
        restoreFetch();
      }
    });

    await test('ResendProvider should throw EmailDeliveryException on 422 unverified domain', async () => {
      mockFetch(async () => {
        return new Response(
          JSON.stringify({
            statusCode: 422,
            name: 'validation_error',
            message: 'The domain cashflow.dev is not verified.'
          }),
          { status: 422, headers: { 'Content-Type': 'application/json' } }
        );
      });

      try {
        const config = createMockConfig({
          RESEND_API_KEY: 're_123',
          EMAIL_FROM: 'notifications@cashflow.dev'
        });
        const provider = new ResendProvider(config);

        await assert.rejects(
          async () =>
            provider.sendEmail({
              to: 'test@example.com',
              subject: 'Test',
              html: 'hi',
              text: 'hi'
            }),
          (err: any) => {
            assert.ok(err instanceof EmailDeliveryException);
            assert.strictEqual(err.provider, 'resend');
            assert.strictEqual(err.statusCode, 422);
            assert.ok(err.message.includes('The domain cashflow.dev is not verified'));
            return true;
          }
        );
      } finally {
        restoreFetch();
      }
    });

    // =========================================================================
    // Category 5: Invalid Recipient Addresses Validation
    // =========================================================================
    console.log('\n--- 5. Invalid Recipient Addresses ---');

    await test('EmailService should reject invalid recipient addresses before invoking provider', async () => {
      let providerCalled = false;
      const mockProvider: EmailProviderInterface = {
        name: 'resend',
        sendEmail: async () => {
          providerCalled = true;
          return { success: true, messageId: '1', provider: 'resend', timestamp: new Date() };
        }
      };

      const emailService = new EmailService(mockProvider, createMockConfig({}));

      // Test empty string
      await assert.rejects(
        () =>
          emailService.sendEmail({
            to: '',
            subject: 'Test',
            html: 'body',
            text: 'body'
          }),
        (err: any) => err instanceof EmailValidationException
      );

      // Test malformed string
      await assert.rejects(
        () =>
          emailService.sendEmail({
            to: 'not_an_email_at_all',
            subject: 'Test',
            html: 'body',
            text: 'body'
          }),
        (err: any) => err instanceof EmailValidationException
      );

      // Test array containing an invalid address
      await assert.rejects(
        () =>
          emailService.sendEmail({
            to: ['valid@example.com', 'invalid-recipient'],
            subject: 'Test',
            html: 'body',
            text: 'body'
          }),
        (err: any) => err instanceof EmailValidationException
      );

      assert.strictEqual(providerCalled, false, 'Provider was never invoked for invalid recipients');
    });

    await test('EmailService should reject empty subject or empty body', async () => {
      const mockProvider: EmailProviderInterface = {
        name: 'gmail',
        sendEmail: async () => ({
          success: true,
          messageId: '1',
          provider: 'gmail',
          timestamp: new Date()
        })
      };
      const emailService = new EmailService(mockProvider, createMockConfig({}));

      await assert.rejects(
        () =>
          emailService.sendEmail({
            to: 'valid@example.com',
            subject: '   ',
            html: 'body',
            text: 'body'
          }),
        (err: any) =>
          err instanceof EmailValidationException && err.message.includes('subject cannot be empty')
      );

      await assert.rejects(
        () =>
          emailService.sendEmail({
            to: 'valid@example.com',
            subject: 'Subject',
            html: '',
            text: ''
          }),
        (err: any) =>
          err instanceof EmailValidationException &&
          err.message.includes('must contain at least HTML or plain-text')
      );
    });

    // =========================================================================
    // Category 6: HTML & Plain-Text Templates
    // =========================================================================
    console.log('\n--- 6. HTML and Plain-Text Templates ---');

    await test('Account verification template renders HTML and text correctly', async () => {
      const result = accountVerificationTemplate({
        name: 'Alice Cooper',
        verificationUrl: 'https://cashflow.dev/verify?token=xyz123',
        code: '849201',
        expiresInMinutes: 15
      });

      assert.strictEqual(result.subject, 'Verify your CashFlow account');
      assert.ok(result.html.includes('Alice Cooper'));
      assert.ok(result.html.includes('849201'));
      assert.ok(result.html.includes('https://cashflow.dev/verify?token=xyz123'));
      assert.ok(result.html.includes('15 minutes'));

      assert.ok(result.text.includes('Alice Cooper'));
      assert.ok(result.text.includes('849201'));
      assert.ok(result.text.includes('https://cashflow.dev/verify?token=xyz123'));
      assert.ok(!result.text.includes('<div>')); // Plain text does not contain HTML tags
    });

    await test('Password reset template renders HTML and text correctly', async () => {
      const result = passwordResetTemplate({
        name: 'Bob Marley',
        resetUrl: 'https://cashflow.dev/reset-password?token=sec456',
        expiresInMinutes: 30,
        ipAddress: '192.168.1.1'
      });

      assert.strictEqual(result.subject, 'Reset your CashFlow password');
      assert.ok(result.html.includes('Bob Marley'));
      assert.ok(result.html.includes('https://cashflow.dev/reset-password?token=sec456'));
      assert.ok(result.html.includes('192.168.1.1'));
      assert.ok(result.html.includes('Security Notice'));

      assert.ok(result.text.includes('Bob Marley'));
      assert.ok(result.text.includes('192.168.1.1'));
      assert.ok(result.text.includes('SECURITY NOTICE'));
    });

    await test('Group invitation template renders HTML and text correctly', async () => {
      const result = groupInvitationTemplate({
        recipientName: 'Charlie',
        inviterName: 'Dana',
        groupName: 'Summer Trip 2026',
        inviteUrl: 'https://cashflow.dev/groups/join/abc789',
        message: 'Looking forward to traveling together!'
      });

      assert.strictEqual(
        result.subject,
        'You\'ve been invited to join "Summer Trip 2026" on CashFlow'
      );
      assert.ok(result.html.includes('Summer Trip 2026'));
      assert.ok(result.html.includes('Dana'));
      assert.ok(result.html.includes('Looking forward to traveling together!'));
      assert.ok(result.html.includes('https://cashflow.dev/groups/join/abc789'));

      assert.ok(result.text.includes('Summer Trip 2026'));
      assert.ok(result.text.includes('Dana'));
      assert.ok(result.text.includes('Looking forward to traveling together!'));
    });

    await test('Transaction notification template renders HTML and text correctly', async () => {
      const result = transactionNotificationTemplate({
        recipientName: 'Eve',
        transactionType: 'expense',
        amount: 84.5,
        currency: '$',
        description: 'Dinner at Italian Bistro',
        groupName: 'Friends & Family',
        accountName: 'Credit Card',
        actionUrl: 'https://cashflow.dev/expenses/999'
      });

      assert.ok(result.subject.includes('$84.50'));
      assert.ok(result.subject.includes('Dinner at Italian Bistro'));
      assert.ok(result.html.includes('$84.50'));
      assert.ok(result.html.includes('EXPENSE'));
      assert.ok(result.html.includes('Friends & Family'));
      assert.ok(result.html.includes('Credit Card'));

      assert.ok(result.text.includes('$84.50'));
      assert.ok(result.text.includes('Dinner at Italian Bistro'));
      assert.ok(result.text.includes('Credit Card'));
    });

    await test('Account notification template renders HTML and text correctly', async () => {
      const result = accountNotificationTemplate({
        recipientName: 'Frank',
        title: 'New Security Login Detected',
        message: 'Your account was accessed from a new device in San Francisco, CA.',
        actionUrl: 'https://cashflow.dev/security',
        actionText: 'Review Security Activity',
        metadata: {
          Browser: 'Chrome 128',
          Device: 'macOS',
          Time: '10:45 AM UTC'
        }
      });

      assert.strictEqual(result.subject, 'New Security Login Detected - CashFlow Notification');
      assert.ok(result.html.includes('New Security Login Detected'));
      assert.ok(result.html.includes('Chrome 128'));
      assert.ok(result.html.includes('Review Security Activity'));

      assert.ok(result.text.includes('Chrome 128'));
      assert.ok(result.text.includes('Review Security Activity'));
    });

    // =========================================================================
    // Category 7: No Accidental Cross-Provider Fallback
    // =========================================================================
    console.log('\n--- 7. No Accidental Cross-Provider Fallback ---');

    await test('When active provider is Gmail and it fails, Resend must NEVER be called', async () => {
      let resendCalled = false;

      const failingGmailProvider: EmailProviderInterface = {
        name: 'gmail',
        sendEmail: async () => {
          throw new EmailDeliveryException('Gmail quota exceeded', 'gmail', 429);
        }
      };

      const mockResendProvider: EmailProviderInterface = {
        name: 'resend',
        sendEmail: async () => {
          resendCalled = true;
          return { success: true, messageId: 'resend_id', provider: 'resend', timestamp: new Date() };
        }
      };

      // EmailService only receives the selected active provider
      const emailService = new EmailService(failingGmailProvider, createMockConfig({}));

      await assert.rejects(
        () =>
          emailService.sendEmail({
            to: 'recipient@example.com',
            subject: 'Test Fallback',
            html: 'msg',
            text: 'msg'
          }),
        (err: any) => {
          assert.ok(err instanceof EmailDeliveryException);
          assert.strictEqual(err.provider, 'gmail');
          return true;
        }
      );

      assert.strictEqual(
        resendCalled,
        false,
        'Resend provider was never called when Gmail failed'
      );
    });

    await test('When active provider is Resend and it fails, Gmail must NEVER be called', async () => {
      let gmailCalled = false;

      const failingResendProvider: EmailProviderInterface = {
        name: 'resend',
        sendEmail: async () => {
          throw new EmailDeliveryException('Resend domain not verified', 'resend', 422);
        }
      };

      const mockGmailProvider: EmailProviderInterface = {
        name: 'gmail',
        sendEmail: async () => {
          gmailCalled = true;
          return { success: true, messageId: 'gmail_id', provider: 'gmail', timestamp: new Date() };
        }
      };

      const emailService = new EmailService(failingResendProvider, createMockConfig({}));

      await assert.rejects(
        () =>
          emailService.sendEmail({
            to: 'recipient@example.com',
            subject: 'Test Fallback',
            html: 'msg',
            text: 'msg'
          }),
        (err: any) => {
          assert.ok(err instanceof EmailDeliveryException);
          assert.strictEqual(err.provider, 'resend');
          return true;
        }
      );

      assert.strictEqual(
        gmailCalled,
        false,
        'Gmail provider was never called when Resend failed'
      );
    });

    // =========================================================================
    // Category 8: Idempotency & Duplicate Send Prevention
    // =========================================================================
    console.log('\n--- 8. Idempotency & Duplicate Send Prevention ---');

    await test('Identical idempotencyKey should return cached result without calling provider twice', async () => {
      let callCount = 0;
      const mockProvider: EmailProviderInterface = {
        name: 'resend',
        sendEmail: async () => {
          callCount++;
          return {
            success: true,
            messageId: `resend_msg_${callCount}`,
            provider: 'resend',
            timestamp: new Date()
          };
        }
      };

      const emailService = new EmailService(mockProvider, createMockConfig({}));

      const res1 = await emailService.sendEmail({
        to: 'user@example.com',
        subject: 'Invoice 101',
        html: '<p>Invoice</p>',
        text: 'Invoice',
        idempotencyKey: 'invoice_tx_101_attempt_1'
      });

      const res2 = await emailService.sendEmail({
        to: 'user@example.com',
        subject: 'Invoice 101',
        html: '<p>Invoice</p>',
        text: 'Invoice',
        idempotencyKey: 'invoice_tx_101_attempt_1'
      });

      assert.strictEqual(callCount, 1, 'Provider was called only once');
      assert.strictEqual(res1.messageId, res2.messageId, 'Same messageId returned from cache');
    });

  } finally {
    restoreFetch();
  }

  console.log('\n================================================================');
  console.log(`   TEST RESULTS: ${passedTests}/${totalTests} PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
