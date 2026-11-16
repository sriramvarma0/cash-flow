import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EMAIL_PROVIDER_TOKEN,
  EmailDeliveryException,
  EmailProviderInterface,
  EmailProviderType,
  EmailSendResult,
  EmailValidationException,
  SendMailParams
} from './interfaces/email-provider.interface';
import { isValidEmail } from './config/email.config';
import {
  AccountVerificationTemplateData,
  accountVerificationTemplate,
  PasswordResetTemplateData,
  passwordResetTemplate,
  GroupInvitationTemplateData,
  groupInvitationTemplate,
  TransactionNotificationTemplateData,
  transactionNotificationTemplate,
  AccountNotificationTemplateData,
  accountNotificationTemplate,
  TwoFactorOtpTemplateData,
  twoFactorOtpTemplate
} from './templates';

interface IdempotencyRecord {
  result: EmailSendResult;
  expiresAt: number;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly idempotencyStore = new Map<string, IdempotencyRecord>();
  private readonly idempotencyTtlMs = 15 * 60 * 1000; // 15 minutes
  private readonly maxRetries = 2; // Maximum retry attempts for transient errors (total 3 attempts)

  constructor(
    @Inject(EMAIL_PROVIDER_TOKEN)
    private readonly provider: EmailProviderInterface,
    private readonly configService: ConfigService
  ) {
    this.logger.log(`EmailService initialized with active provider: [${this.provider.name}]`);

    // Periodic sweep for expired idempotency entries
    const sweepInterval = setInterval(() => {
      this.purgeExpiredIdempotency();
    }, 5 * 60 * 1000);

    // Prevent process hanging in test environments
    if (typeof sweepInterval.unref === 'function') {
      sweepInterval.unref();
    }
  }

  /**
   * Returns the name of the currently active email provider.
   */
  getActiveProviderName(): EmailProviderType {
    return this.provider.name;
  }

  /**
   * Sends an email with full validation, idempotency protection, controlled retries,
   * safe logging, and strict single-provider execution (no cross-provider fallback).
   */
  async sendEmail(params: SendMailParams): Promise<EmailSendResult> {
    // 1. Validate recipients
    this.validateRecipients(params.to);
    if (params.cc) this.validateRecipients(params.cc);
    if (params.bcc) this.validateRecipients(params.bcc);

    if (!params.subject || !params.subject.trim()) {
      throw new EmailValidationException('Email subject cannot be empty');
    }

    if (!params.html && !params.text) {
      throw new EmailValidationException('Email must contain at least HTML or plain-text content');
    }

    // 2. Check idempotency
    if (params.idempotencyKey) {
      const cached = this.idempotencyStore.get(params.idempotencyKey);
      if (cached && Date.now() < cached.expiresAt) {
        this.logger.log(
          `Idempotent duplicate send prevented for key: [${params.idempotencyKey}]. Returning cached result.`
        );
        return cached.result;
      }
    }

    // 3. Send email with controlled retries on transient errors
    const result = await this.executeWithRetry(params);

    // 4. Record idempotency if key was provided
    if (params.idempotencyKey) {
      this.idempotencyStore.set(params.idempotencyKey, {
        result,
        expiresAt: Date.now() + this.idempotencyTtlMs
      });
    }

    // 5. Safe logging (never logs content or credentials)
    const primaryRecipient = Array.isArray(params.to) ? params.to[0] : params.to;
    const recipientCount = Array.isArray(params.to) ? params.to.length : 1;
    this.logger.log(
      `Email sent successfully via [${result.provider}]. Message ID: ${result.messageId}, Recipient: ${this.maskEmail(
        primaryRecipient
      )}${recipientCount > 1 ? ` (+${recipientCount - 1} more)` : ''}, Subject: "${this.sanitizeSubject(params.subject)}"`
    );

    return result;
  }

  // ===========================================================================
  // Convenience Methods for Reusable Templates
  // ===========================================================================

  async sendAccountVerification(
    to: string,
    data: AccountVerificationTemplateData,
    idempotencyKey?: string
  ): Promise<EmailSendResult> {
    const template = accountVerificationTemplate(data);
    return this.sendEmail({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
      idempotencyKey
    });
  }

  async sendPasswordReset(
    to: string,
    data: PasswordResetTemplateData,
    idempotencyKey?: string
  ): Promise<EmailSendResult> {
    const template = passwordResetTemplate(data);
    return this.sendEmail({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
      idempotencyKey
    });
  }

  async sendGroupInvitation(
    to: string,
    data: GroupInvitationTemplateData,
    idempotencyKey?: string
  ): Promise<EmailSendResult> {
    const template = groupInvitationTemplate(data);
    return this.sendEmail({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
      idempotencyKey
    });
  }

  async sendTransactionNotification(
    to: string,
    data: TransactionNotificationTemplateData,
    idempotencyKey?: string
  ): Promise<EmailSendResult> {
    const template = transactionNotificationTemplate(data);
    return this.sendEmail({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
      idempotencyKey
    });
  }

  async sendAccountNotification(
    to: string,
    data: AccountNotificationTemplateData,
    idempotencyKey?: string
  ): Promise<EmailSendResult> {
    const template = accountNotificationTemplate(data);
    return this.sendEmail({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
      idempotencyKey
    });
  }

  async sendTwoFactorOtp(
    to: string,
    data: TwoFactorOtpTemplateData,
    idempotencyKey?: string
  ): Promise<EmailSendResult> {
    const template = twoFactorOtpTemplate(data);
    return this.sendEmail({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
      idempotencyKey
    });
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Executes the active provider with controlled retries ONLY for safe transient errors.
   * Client errors (4xx) are NEVER retried.
   * Fallback to another provider is NEVER performed.
   */
  private async executeWithRetry(params: SendMailParams): Promise<EmailSendResult> {
    let lastError: any;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.provider.sendEmail(params);
      } catch (error: any) {
        lastError = error;

        const isRetriable = this.isRetriableError(error);
        if (!isRetriable || attempt === this.maxRetries) {
          // Log failure safely without exposing sensitive data
          this.logger.error(
            `Email delivery failed via [${this.provider.name}] on attempt ${attempt + 1}: ${error.message}`
          );
          throw error;
        }

        const delayMs = Math.pow(2, attempt) * 300;
        this.logger.warn(
          `Transient error sending email via [${this.provider.name}] on attempt ${attempt + 1}: ${
            error.message
          }. Retrying in ${delayMs}ms...`
        );
        await this.sleep(delayMs);
      }
    }

    throw lastError;
  }

  /**
   * Determines whether an error is transient and safe to retry.
   * 4xx client errors are never retried.
   */
  private isRetriableError(error: any): boolean {
    if (error instanceof EmailDeliveryException) {
      if (error.statusCode) {
        // 429 (Rate Limit) or 5xx (Server Error) are retriable
        if (error.statusCode === 429 || error.statusCode >= 500) {
          return true;
        }
        // 4xx errors (e.g. 400 Bad Request, 401 Unauthorized, 403 Forbidden, 422 Unprocessable) are not
        return false;
      }
    }

    const message = (error?.message || '').toLowerCase();
    const isTimeout =
      error?.name === 'TimeoutError' ||
      error?.name === 'AbortError' ||
      message.includes('timeout') ||
      message.includes('abort');

    const isNetwork =
      message.includes('econnreset') ||
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('network');

    return isTimeout || isNetwork;
  }

  private validateRecipients(recipients: string | string[]): void {
    const list = Array.isArray(recipients) ? recipients : [recipients];
    if (list.length === 0) {
      throw new EmailValidationException('At least one recipient email address must be provided');
    }

    for (const email of list) {
      if (!isValidEmail(email)) {
        throw new EmailValidationException(
          `Invalid recipient email address: "${this.maskEmail(email || '')}"`
        );
      }
    }
  }

  private maskEmail(email: string): string {
    if (!email) return '***';
    const trimmed = email.trim();
    const angleMatch = trimmed.match(/<([^>]+)>/);
    const target = angleMatch ? angleMatch[1] : trimmed;
    const parts = target.split('@');
    if (parts.length !== 2) return '***';
    const [local, domain] = parts;
    const maskedLocal = local.length > 2 ? `${local[0]}***${local[local.length - 1]}` : `${local[0]}***`;
    return `${maskedLocal}@${domain}`;
  }

  private sanitizeSubject(subject: string): string {
    return subject.replace(/[\r\n]/g, ' ').substring(0, 80);
  }

  private purgeExpiredIdempotency(): void {
    const now = Date.now();
    for (const [key, record] of this.idempotencyStore.entries()) {
      if (now >= record.expiresAt) {
        this.idempotencyStore.delete(key);
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

