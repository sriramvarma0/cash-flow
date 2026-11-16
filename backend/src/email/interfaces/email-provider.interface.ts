export const EMAIL_PROVIDER_TOKEN = 'EMAIL_PROVIDER_TOKEN';

export type EmailProviderType = 'gmail' | 'resend' | 'none';

export interface EmailAttachment {
  filename: string;
  content: string | Buffer;
  contentType?: string;
}

export interface SendMailParams {
  to: string | string[];
  from?: string; // Optional sender address override
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
  attachments?: EmailAttachment[];
  idempotencyKey?: string;
}

export interface EmailSendResult {
  success: boolean;
  messageId: string;
  provider: EmailProviderType;
  timestamp: Date;
}

export interface EmailProviderInterface {
  readonly name: EmailProviderType;
  sendEmail(params: SendMailParams): Promise<EmailSendResult>;
  verifyConnection?(): Promise<boolean>;
}

export class EmailDeliveryException extends Error {
  constructor(
    message: string,
    public readonly provider: EmailProviderType,
    public readonly statusCode?: number,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'EmailDeliveryException';
  }
}

export class EmailConfigurationException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailConfigurationException';
  }
}

export class EmailValidationException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailValidationException';
  }
}
