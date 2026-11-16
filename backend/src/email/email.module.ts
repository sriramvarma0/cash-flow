import { Global, Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  EMAIL_PROVIDER_TOKEN,
  EmailConfigurationException,
  EmailProviderInterface,
  EmailSendResult
} from './interfaces/email-provider.interface';
import { GmailProvider } from './providers/gmail.provider';
import { ResendProvider } from './providers/resend.provider';
import { EmailService } from './email.service';

export class UnconfiguredEmailProvider implements EmailProviderInterface {
  readonly name = 'none' as const;
  async sendEmail(): Promise<EmailSendResult> {
    throw new EmailConfigurationException(
      'No email provider configured. Please set EMAIL_PROVIDER to "gmail" or "resend" in your environment.'
    );
  }
}

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    GmailProvider,
    ResendProvider,
    {
      provide: EMAIL_PROVIDER_TOKEN,
      useFactory: (
        configService: ConfigService,
        gmailProvider: GmailProvider,
        resendProvider: ResendProvider
      ) => {
        const raw = configService.get<string>('EMAIL_PROVIDER');
        if (!raw || !raw.trim()) {
          Logger.warn(
            'EMAIL_PROVIDER environment variable is not configured. Email operations will be disabled.',
            'EmailModule'
          );
          return new UnconfiguredEmailProvider();
        }

        const provider = raw.trim().toLowerCase();
        if (provider === 'gmail') {
          return gmailProvider;
        } else if (provider === 'resend') {
          return resendProvider;
        } else {
          throw new EmailConfigurationException(
            `Invalid EMAIL_PROVIDER: "${raw}". Allowed values are "gmail" or "resend".`
          );
        }
      },
      inject: [ConfigService, GmailProvider, ResendProvider]
    },
    EmailService
  ],
  exports: [EmailService, EMAIL_PROVIDER_TOKEN, GmailProvider, ResendProvider]
})
export class EmailModule {}
