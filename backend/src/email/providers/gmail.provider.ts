import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EmailDeliveryException,
  EmailProviderInterface,
  EmailSendResult,
  SendMailParams
} from '../interfaces/email-provider.interface';

@Injectable()
export class GmailProvider implements EmailProviderInterface {
  readonly name = 'gmail' as const;
  private readonly logger = new Logger(GmailProvider.name);

  private readonly user: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly refreshToken: string;
  private readonly timeoutMs: number;

  private cachedAccessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(private readonly configService: ConfigService) {
    this.user = this.configService.get<string>('GMAIL_USER', '').trim();
    this.clientId = this.configService.get<string>('GMAIL_CLIENT_ID', '').trim();
    this.clientSecret = this.configService.get<string>('GMAIL_CLIENT_SECRET', '').trim();
    this.refreshToken = this.configService.get<string>('GMAIL_REFRESH_TOKEN', '').trim();
    this.timeoutMs = Number(this.configService.get<string>('EMAIL_REQUEST_TIMEOUT_MS', '10000'));
  }

  /**
   * Retrieves a valid OAuth2 access token, refreshing if needed.
   * Cached until 60 seconds prior to expiration.
   */
  async getAccessToken(): Promise<string> {
    if (this.cachedAccessToken && Date.now() < this.tokenExpiresAt - 60000) {
      return this.cachedAccessToken;
    }

    const tokenEndpoint = 'https://oauth2.googleapis.com/token';
    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: this.refreshToken,
      grant_type: 'refresh_token'
    });

    try {
      const response = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString(),
        signal: AbortSignal.timeout(this.timeoutMs)
      });

      if (!response.ok) {
        let errDetails = '';
        try {
          const errJson = (await response.json()) as Record<string, any>;
          errDetails = errJson.error_description || errJson.error || response.statusText;
        } catch {
          errDetails = response.statusText;
        }
        throw new EmailDeliveryException(
          `Gmail OAuth2 token refresh failed (${response.status}): ${errDetails}`,
          'gmail',
          response.status
        );
      }

      const data = (await response.json()) as {
        access_token: string;
        expires_in: number;
        token_type: string;
      };

      if (!data.access_token) {
        throw new EmailDeliveryException(
          'Gmail OAuth2 response did not contain an access_token',
          'gmail',
          response.status
        );
      }

      this.cachedAccessToken = data.access_token;
      this.tokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;

      return this.cachedAccessToken;
    } catch (error: any) {
      if (error instanceof EmailDeliveryException) {
        throw error;
      }
      const isTimeout = error.name === 'TimeoutError' || error.name === 'AbortError';
      throw new EmailDeliveryException(
        `Gmail OAuth2 token request error: ${isTimeout ? 'Request timed out' : error.message}`,
        'gmail',
        undefined,
        error
      );
    }
  }

  /**
   * Sends an email using the Gmail REST API (users.messages.send) with OAuth2.
   */
  async sendEmail(params: SendMailParams): Promise<EmailSendResult> {
    const accessToken = await this.getAccessToken();
    const rawMime = this.buildMimeMessage(params);
    const base64UrlRaw = this.toBase64Url(Buffer.from(rawMime, 'utf-8'));

    const sendEndpoint = `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(
      this.user || 'me'
    )}/messages/send`;

    try {
      const response = await fetch(sendEndpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ raw: base64UrlRaw }),
        signal: AbortSignal.timeout(this.timeoutMs)
      });

      if (!response.ok) {
        let errMsg = `Gmail API error (${response.status})`;
        try {
          const errData = (await response.json()) as Record<string, any>;
          if (errData.error?.message) {
            errMsg += `: ${errData.error.message}`;
          }
        } catch {
          errMsg += `: ${response.statusText}`;
        }
        throw new EmailDeliveryException(errMsg, 'gmail', response.status);
      }

      const data = (await response.json()) as { id: string; threadId?: string };

      if (!data || !data.id) {
        throw new EmailDeliveryException(
          'Gmail API returned success but missing message ID',
          'gmail',
          response.status
        );
      }

      return {
        success: true,
        messageId: data.id,
        provider: 'gmail',
        timestamp: new Date()
      };
    } catch (error: any) {
      if (error instanceof EmailDeliveryException) {
        throw error;
      }
      const isTimeout = error.name === 'TimeoutError' || error.name === 'AbortError';
      throw new EmailDeliveryException(
        `Gmail send failure: ${isTimeout ? 'Request timed out' : error.message}`,
        'gmail',
        undefined,
        error
      );
    }
  }

  /**
   * Encodes a Buffer to URL-safe Base64 without padding (RFC 4648 § 5)
   */
  private toBase64Url(buf: Buffer): string {
    return buf
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  /**
   * Builds an RFC 2822 compliant MIME message string.
   */
  private buildMimeMessage(params: SendMailParams): string {
    const from = params.from || this.user;
    const to = Array.isArray(params.to) ? params.to.join(', ') : params.to;
    const boundaryAlt = `_cf_alt_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    const boundaryMixed = `_cf_mix_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    const hasAttachments = params.attachments && params.attachments.length > 0;

    const baseHeaders = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: =?UTF-8?B?${Buffer.from(params.subject, 'utf-8').toString('base64')}?=`,
      'MIME-Version: 1.0'
    ];

    if (params.replyTo) {
      baseHeaders.push(`Reply-To: ${params.replyTo}`);
    }
    if (params.cc) {
      baseHeaders.push(`Cc: ${Array.isArray(params.cc) ? params.cc.join(', ') : params.cc}`);
    }
    if (params.bcc) {
      baseHeaders.push(`Bcc: ${Array.isArray(params.bcc) ? params.bcc.join(', ') : params.bcc}`);
    }

    const lines: string[] = [];

    if (hasAttachments) {
      // Outer multipart/mixed
      lines.push(
        ...baseHeaders,
        `Content-Type: multipart/mixed; boundary="${boundaryMixed}"`,
        '',
        `--${boundaryMixed}`,
        `Content-Type: multipart/alternative; boundary="${boundaryAlt}"`,
        ''
      );
    } else {
      lines.push(
        ...baseHeaders,
        `Content-Type: multipart/alternative; boundary="${boundaryAlt}"`,
        ''
      );
    }

    // Alternative part: text/plain
    lines.push(
      `--${boundaryAlt}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(params.text, 'utf-8').toString('base64'),
      '',
      `--${boundaryAlt}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(params.html, 'utf-8').toString('base64'),
      '',
      `--${boundaryAlt}--`
    );

    // Attachments if any
    if (hasAttachments) {
      for (const att of params.attachments!) {
        const attBuffer = Buffer.isBuffer(att.content)
          ? att.content
          : Buffer.from(att.content, 'utf-8');
        const ctype = att.contentType || 'application/octet-stream';
        lines.push(
          '',
          `--${boundaryMixed}`,
          `Content-Type: ${ctype}; name="${att.filename}"`,
          `Content-Disposition: attachment; filename="${att.filename}"`,
          'Content-Transfer-Encoding: base64',
          '',
          attBuffer.toString('base64')
        );
      }
      lines.push('', `--${boundaryMixed}--`);
    }

    lines.push('');
    return lines.join('\r\n');
  }
}

