import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EmailDeliveryException,
  EmailProviderInterface,
  EmailSendResult,
  SendMailParams
} from '../interfaces/email-provider.interface';

@Injectable()
export class ResendProvider implements EmailProviderInterface {
  readonly name = 'resend' as const;
  private readonly logger = new Logger(ResendProvider.name);

  private readonly apiKey: string;
  private readonly from: string;
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('RESEND_API_KEY', '').trim();
    this.from = this.configService.get<string>('EMAIL_FROM', '').trim();
    this.timeoutMs = Number(this.configService.get<string>('EMAIL_REQUEST_TIMEOUT_MS', '10000'));
  }

  /**
   * Sends an email using the Resend REST API (POST https://api.resend.com/emails).
   */
  async sendEmail(params: SendMailParams): Promise<EmailSendResult> {
    const fromAddress = params.from || this.from;
    const toRecipients = Array.isArray(params.to) ? params.to : [params.to];

    const payload: Record<string, any> = {
      from: fromAddress,
      to: toRecipients,
      subject: params.subject,
      html: params.html,
      text: params.text
    };

    if (params.replyTo) {
      payload.reply_to = params.replyTo;
    }
    if (params.cc) {
      payload.cc = Array.isArray(params.cc) ? params.cc : [params.cc];
    }
    if (params.bcc) {
      payload.bcc = Array.isArray(params.bcc) ? params.bcc : [params.bcc];
    }

    if (params.attachments && params.attachments.length > 0) {
      payload.attachments = params.attachments.map((att) => ({
        filename: att.filename,
        content: Buffer.isBuffer(att.content)
          ? att.content.toString('base64')
          : Buffer.from(att.content).toString('base64')
      }));
    }

    const endpoint = 'https://api.resend.com/emails';

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs)
      });

      if (!response.ok) {
        let errMsg = `Resend API error (${response.status})`;
        try {
          const errData = (await response.json()) as Record<string, any>;
          if (errData.message) {
            errMsg += `: ${errData.message}`;
          }
          if (errData.name) {
            errMsg += ` [${errData.name}]`;
          }
        } catch {
          errMsg += `: ${response.statusText}`;
        }
        throw new EmailDeliveryException(errMsg, 'resend', response.status);
      }

      const data = (await response.json()) as { id: string };

      if (!data || !data.id) {
        throw new EmailDeliveryException(
          'Resend API returned success but missing message ID',
          'resend',
          response.status
        );
      }

      return {
        success: true,
        messageId: data.id,
        provider: 'resend',
        timestamp: new Date()
      };
    } catch (error: any) {
      if (error instanceof EmailDeliveryException) {
        throw error;
      }
      const isTimeout = error.name === 'TimeoutError' || error.name === 'AbortError';
      throw new EmailDeliveryException(
        `Resend send failure: ${isTimeout ? 'Request timed out' : error.message}`,
        'resend',
        undefined,
        error
      );
    }
  }
}

