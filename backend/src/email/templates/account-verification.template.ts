import { renderBaseHtml, renderBaseText } from './base.template';

export interface AccountVerificationTemplateData {
  name?: string;
  verificationUrl: string;
  code?: string;
  expiresInMinutes?: number;
}

export function accountVerificationTemplate(data: AccountVerificationTemplateData) {
  const subject = 'Verify your CashFlow account';
  const greeting = data.name ? `Hello ${data.name},` : 'Hello,';
  const expirationText = data.expiresInMinutes
    ? `This verification link will expire in ${data.expiresInMinutes} minutes.`
    : 'This link will expire shortly for your security.';

  const codeHtml = data.code
    ? `
      <div style="margin: 24px 0; padding: 16px; background-color: #f3f4f6; border-radius: 8px; text-align: center;">
        <span style="font-size: 13px; color: #6b7280; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Verification Code</span>
        <div style="font-size: 28px; font-weight: 700; letter-spacing: 4px; color: #111827; margin-top: 6px; font-family: monospace;">
          ${data.code}
        </div>
      </div>
    `
    : '';

  const contentHtml = `
    <h1 style="font-size: 20px; font-weight: 700; color: #111827; margin: 0 0 16px 0;">Welcome to CashFlow</h1>
    <p style="margin: 0 0 16px 0;">${greeting}</p>
    <p style="margin: 0 0 20px 0;">
      Thank you for creating your CashFlow account. Please verify your email address to activate your account and start managing your finances and group expenses.
    </p>

    ${codeHtml}

    <div style="text-align: center; margin: 28px 0;">
      <a href="${data.verificationUrl}" class="btn" style="background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; display: inline-block;">
        Verify Email Address
      </a>
    </div>

    <p style="font-size: 13px; color: #6b7280; margin: 24px 0 0 0;">
      ${expirationText} If you did not create a CashFlow account, you can safely ignore this email.
    </p>

    <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; word-break: break-all;">
      Or copy and paste this URL into your browser:<br/>
      <a href="${data.verificationUrl}" style="color: #2563eb;">${data.verificationUrl}</a>
    </div>
  `;

  const codeText = data.code ? `\nVerification Code: ${data.code}\n` : '';

  const contentText = `
Welcome to CashFlow

${greeting}

Thank you for creating your CashFlow account. Please verify your email address to activate your account:
${codeText}
Verify your email by clicking or opening this link:
${data.verificationUrl}

${expirationText}
If you did not sign up for CashFlow, please ignore this email.
  `;

  return {
    subject,
    html: renderBaseHtml({
      title: subject,
      previewText: 'Verify your email address to activate your CashFlow account.',
      contentHtml,
      contentText,
      footerNote: 'Sent to verify ownership of this email address.'
    }),
    text: renderBaseText({
      title: subject,
      contentHtml: '',
      contentText,
      footerNote: 'Sent to verify ownership of this email address.'
    })
  };
}

