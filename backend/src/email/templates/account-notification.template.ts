import { renderBaseHtml, renderBaseText } from './base.template';

export interface AccountNotificationTemplateData {
  recipientName?: string;
  title: string;
  message: string;
  actionUrl?: string;
  actionText?: string;
  metadata?: Record<string, string | number>;
}

export function accountNotificationTemplate(data: AccountNotificationTemplateData) {
  const subject = `${data.title} - CashFlow Notification`;
  const greeting = data.recipientName ? `Hello ${data.recipientName},` : 'Hello,';

  const metadataHtml =
    data.metadata && Object.keys(data.metadata).length > 0
      ? `
      <div style="margin: 20px 0; padding: 16px; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
        <table role="presentation" width="100%">
          ${Object.entries(data.metadata)
            .map(
              ([key, val]) =>
                `<tr>
                  <td style="padding: 4px 0; font-size: 13px; color: #64748b; font-weight: 500;">${key}</td>
                  <td style="padding: 4px 0; font-size: 13px; color: #0f172a; font-weight: 600; text-align: right;">${val}</td>
                </tr>`
            )
            .join('')}
        </table>
      </div>
    `
      : '';

  const metadataText =
    data.metadata && Object.keys(data.metadata).length > 0
      ? '\n' +
        Object.entries(data.metadata)
          .map(([key, val]) => `${key}: ${val}`)
          .join('\n') +
        '\n'
      : '';

  const actionButtonHtml =
    data.actionUrl && data.actionText
      ? `
      <div style="text-align: center; margin: 28px 0;">
        <a href="${data.actionUrl}" class="btn" style="background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; display: inline-block;">
          ${data.actionText}
        </a>
      </div>
    `
      : '';

  const actionTextContent =
    data.actionUrl && data.actionText
      ? `\n${data.actionText}: ${data.actionUrl}\n`
      : '';

  const contentHtml = `
    <h1 style="font-size: 20px; font-weight: 700; color: #111827; margin: 0 0 16px 0;">${data.title}</h1>
    <p style="margin: 0 0 16px 0;">${greeting}</p>
    <p style="margin: 0 0 20px 0; white-space: pre-line;">${data.message}</p>

    ${metadataHtml}
    ${actionButtonHtml}
  `;

  const contentText = `
${data.title}

${greeting}

${data.message}
${metadataText}
${actionTextContent}
  `;

  return {
    subject,
    html: renderBaseHtml({
      title: subject,
      previewText: data.title,
      contentHtml,
      contentText,
      footerNote: 'Notification sent from your CashFlow account.'
    }),
    text: renderBaseText({
      title: subject,
      contentHtml: '',
      contentText,
      footerNote: 'Notification sent from your CashFlow account.'
    })
  };
}

