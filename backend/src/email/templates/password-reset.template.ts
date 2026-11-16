import { renderBaseHtml, renderBaseText } from './base.template';

export interface PasswordResetTemplateData {
  name?: string;
  resetUrl: string;
  expiresInMinutes?: number;
  ipAddress?: string;
}

export function passwordResetTemplate(data: PasswordResetTemplateData) {
  const subject = 'Reset your CashFlow password';
  const greeting = data.name ? `Hello ${data.name},` : 'Hello,';
  const expirationText = data.expiresInMinutes
    ? `This password reset link is valid for ${data.expiresInMinutes} minutes.`
    : 'This link is valid for a limited time for your security.';

  const ipNoticeHtml = data.ipAddress
    ? `<p style="font-size: 13px; color: #6b7280; margin: 8px 0 0 0;">Requested from IP address: <code>${data.ipAddress}</code></p>`
    : '';

  const ipNoticeText = data.ipAddress
    ? `Requested from IP address: ${data.ipAddress}\n`
    : '';

  const contentHtml = `
    <h1 style="font-size: 20px; font-weight: 700; color: #111827; margin: 0 0 16px 0;">Password Reset Request</h1>
    <p style="margin: 0 0 16px 0;">${greeting}</p>
    <p style="margin: 0 0 20px 0;">
      We received a request to reset the password for your CashFlow account. Click the button below to choose a new password.
    </p>

    <div style="text-align: center; margin: 28px 0;">
      <a href="${data.resetUrl}" class="btn" style="background-color: #dc2626; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; display: inline-block;">
        Reset Password
      </a>
    </div>

    <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 12px 16px; margin: 20px 0; border-radius: 4px;">
      <p style="margin: 0; font-size: 13px; color: #991b1b; font-weight: 500;">
        <strong>Security Notice:</strong> If you did not make this request, someone else may be attempting to access your account. You can disregard this email—your password will remain unchanged.
      </p>
    </div>

    <p style="font-size: 13px; color: #6b7280; margin: 16px 0 0 0;">
      ${expirationText}
    </p>
    ${ipNoticeHtml}

    <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; word-break: break-all;">
      Or copy and paste this URL into your browser:<br/>
      <a href="${data.resetUrl}" style="color: #2563eb;">${data.resetUrl}</a>
    </div>
  `;

  const contentText = `
Password Reset Request

${greeting}

We received a request to reset the password for your CashFlow account.

Reset your password using the following link:
${data.resetUrl}

${expirationText}
${ipNoticeText}
SECURITY NOTICE: If you did not request a password reset, you can safely ignore this email. Your current password remains secure.
  `;

  return {
    subject,
    html: renderBaseHtml({
      title: subject,
      previewText: 'A password reset was requested for your CashFlow account.',
      contentHtml,
      contentText,
      footerNote: 'This security alert was sent because a password reset was requested for your account.'
    }),
    text: renderBaseText({
      title: subject,
      contentHtml: '',
      contentText,
      footerNote: 'This security alert was sent because a password reset was requested for your account.'
    })
  };
}

