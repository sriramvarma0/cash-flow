import {
  EmailConfigurationException,
  EmailProviderType
} from '../interfaces/email-provider.interface';

export interface GmailConfig {
  user: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export interface ResendConfig {
  apiKey: string;
  from: string;
}

export interface EmailConfig {
  provider: EmailProviderType;
  gmail?: GmailConfig;
  resend?: ResendConfig;
}

const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  // Handle "Display Name <email@domain.com>" or bare "email@domain.com"
  const angleMatch = trimmed.match(/<([^>]+)>/);
  const targetEmail = angleMatch ? angleMatch[1].trim() : trimmed;
  return EMAIL_REGEX.test(targetEmail);
}

export function validateEmailConfig(
  config: Record<string, string | undefined>
): EmailConfig {
  const rawProvider = config.EMAIL_PROVIDER;

  if (!rawProvider || !rawProvider.trim()) {
    throw new EmailConfigurationException(
      'Missing required environment variable: EMAIL_PROVIDER (must be "gmail" or "resend")'
    );
  }

  const provider = rawProvider.trim().toLowerCase();

  if (provider !== 'gmail' && provider !== 'resend') {
    throw new EmailConfigurationException(
      `Invalid EMAIL_PROVIDER: "${rawProvider}". Allowed values are "gmail" or "resend".`
    );
  }

  if (provider === 'gmail') {
    const missing: string[] = [];
    if (!config.GMAIL_USER || !config.GMAIL_USER.trim()) missing.push('GMAIL_USER');
    if (!config.GMAIL_CLIENT_ID || !config.GMAIL_CLIENT_ID.trim()) missing.push('GMAIL_CLIENT_ID');
    if (!config.GMAIL_CLIENT_SECRET || !config.GMAIL_CLIENT_SECRET.trim()) missing.push('GMAIL_CLIENT_SECRET');
    if (!config.GMAIL_REFRESH_TOKEN || !config.GMAIL_REFRESH_TOKEN.trim()) missing.push('GMAIL_REFRESH_TOKEN');

    if (missing.length > 0) {
      throw new EmailConfigurationException(
        `Missing required environment variable(s) for Gmail provider: ${missing.join(', ')}`
      );
    }

    const user = config.GMAIL_USER!.trim();
    if (!isValidEmail(user)) {
      throw new EmailConfigurationException(
        `Invalid GMAIL_USER format: "${user}". Must be a valid email address.`
      );
    }

    return {
      provider: 'gmail',
      gmail: {
        user,
        clientId: config.GMAIL_CLIENT_ID!.trim(),
        clientSecret: config.GMAIL_CLIENT_SECRET!.trim(),
        refreshToken: config.GMAIL_REFRESH_TOKEN!.trim()
      }
    };
  }

  // provider === 'resend'
  const missing: string[] = [];
  if (!config.RESEND_API_KEY || !config.RESEND_API_KEY.trim()) missing.push('RESEND_API_KEY');
  if (!config.EMAIL_FROM || !config.EMAIL_FROM.trim()) missing.push('EMAIL_FROM');

  if (missing.length > 0) {
    throw new EmailConfigurationException(
      `Missing required environment variable(s) for Resend provider: ${missing.join(', ')}`
    );
  }

  const from = config.EMAIL_FROM!.trim();
  if (!isValidEmail(from)) {
    throw new EmailConfigurationException(
      `Invalid EMAIL_FROM format: "${from}". Must be a valid email address or "Sender Name <sender@domain.com>".`
    );
  }

  return {
    provider: 'resend',
    resend: {
      apiKey: config.RESEND_API_KEY!.trim(),
      from
    }
  };
}

