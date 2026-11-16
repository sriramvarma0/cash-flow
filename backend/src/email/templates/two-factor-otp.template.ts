import { renderBaseHtml, renderBaseText } from './base.template';

export interface TwoFactorOtpTemplateData {
  name?: string;
  code: string;
  purpose?: 'login' | 'setup';
  expiresInMinutes?: number;
}

export function twoFactorOtpTemplate(data: TwoFactorOtpTemplateData) {
  const isSetup = data.purpose === 'setup';
  const subject = isSetup
    ? `Your CashFlow 2FA Setup Code: ${data.code}`
    : `Your CashFlow Login Verification Code: ${data.code}`;

  const greeting = data.name ? `Hello ${data.name},` : 'Hello,';
  const expiresIn = data.expiresInMinutes ?? 10;

  const title = isSetup
    ? 'Verify Your Email for Two-Factor Authentication'
    : 'Two-Factor Sign-In Verification';

  const introText = isSetup
    ? 'You recently initiated setup for Email Two-Factor Authentication on your CashFlow account. Please use the following 6-digit verification code to confirm your email and activate 2FA:'
    : 'A sign-in attempt was initiated for your CashFlow account. Please enter the following 6-digit code to complete authentication:';

  const contentHtml = `
    <h1 style="font-size: 20px; font-weight: 700; color: #111827; margin: 0 0 16px 0;">${title}</h1>
    <p style="margin: 0 0 16px 0;">${greeting}</p>
    <p style="margin: 0 0 20px 0; color: #374151;">
      ${introText}
    </p>

    <!-- OTP Code Display Card -->
    <div style="margin: 28px 0; padding: 24px; background-color: #f0fdf4; border: 2px dashed #86efac; border-radius: 12px; text-align: center;">
      <span style="font-size: 12px; color: #166534; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 700;">
        6-Digit Verification Code
      </span>
      <div style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #15803d; margin-top: 10px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;">
        ${data.code}
      </div>
      <p style="margin: 8px 0 0 0; font-size: 13px; color: #166534; font-weight: 500;">
        Valid for ${expiresIn} minutes
      </p>
    </div>

    <!-- Security Warning Box -->
    <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 12px 16px; margin: 24px 0; border-radius: 4px;">
      <p style="margin: 0; font-size: 13px; color: #991b1b; font-weight: 500;">
        <strong>Security Notice:</strong> Never share this code with anyone. CashFlow staff will never ask for your verification code. If you did not initiate this request, someone may be attempting to access your account. Please change your password immediately.
      </p>
    </div>
  `;

  const contentText = `
${title}

${greeting}

${introText}

VERIFICATION CODE: ${data.code}
(Valid for ${expiresIn} minutes)

SECURITY NOTICE: Never share this verification code with anyone. If you did not request this code, please secure your account by changing your password immediately.
  `;

  return {
    subject,
    html: renderBaseHtml({
      title: subject,
      previewText: `Your CashFlow security verification code is ${data.code}.`,
      contentHtml,
      contentText,
      footerNote: 'This security verification email was sent automatically.'
    }),
    text: renderBaseText({
      title: subject,
      contentHtml: '',
      contentText,
      footerNote: 'This security verification email was sent automatically.'
    })
  };
}

