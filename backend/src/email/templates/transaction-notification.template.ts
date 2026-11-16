import { renderBaseHtml, renderBaseText } from './base.template';

export interface TransactionNotificationTemplateData {
  recipientName?: string;
  transactionType: 'expense' | 'income' | 'investment' | 'settlement' | string;
  amount: number | string;
  currency?: string;
  description: string;
  date?: string | Date;
  groupName?: string;
  accountName?: string;
  actionUrl?: string;
}

export function transactionNotificationTemplate(data: TransactionNotificationTemplateData) {
  const currencySymbol = data.currency || '$';
  const formattedAmount =
    typeof data.amount === 'number'
      ? `${currencySymbol}${data.amount.toFixed(2)}`
      : `${currencySymbol}${data.amount}`;

  const formattedDate = data.date
    ? new Date(data.date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    : new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });

  const subject = `Transaction Alert: ${formattedAmount} - ${data.description}`;
  const greeting = data.recipientName ? `Hello ${data.recipientName},` : 'Hello,';
  const typeLabel = data.transactionType.toUpperCase();

  const detailsRows = [
    `<tr><td style="padding: 8px 0; color: #6b7280; font-size: 13px;">Type</td><td style="padding: 8px 0; font-weight: 600; text-align: right; color: #111827; font-size: 13px;">${typeLabel}</td></tr>`,
    `<tr><td style="padding: 8px 0; color: #6b7280; font-size: 13px;">Date</td><td style="padding: 8px 0; font-weight: 500; text-align: right; color: #111827; font-size: 13px;">${formattedDate}</td></tr>`,
    data.groupName
      ? `<tr><td style="padding: 8px 0; color: #6b7280; font-size: 13px;">Group</td><td style="padding: 8px 0; font-weight: 500; text-align: right; color: #111827; font-size: 13px;">${data.groupName}</td></tr>`
      : '',
    data.accountName
      ? `<tr><td style="padding: 8px 0; color: #6b7280; font-size: 13px;">Account</td><td style="padding: 8px 0; font-weight: 500; text-align: right; color: #111827; font-size: 13px;">${data.accountName}</td></tr>`
      : ''
  ]
    .filter(Boolean)
    .join('');

  const actionButtonHtml = data.actionUrl
    ? `
      <div style="text-align: center; margin: 28px 0;">
        <a href="${data.actionUrl}" class="btn" style="background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; display: inline-block;">
          View Transaction
        </a>
      </div>
    `
    : '';

  const contentHtml = `
    <h1 style="font-size: 20px; font-weight: 700; color: #111827; margin: 0 0 16px 0;">Transaction Recorded</h1>
    <p style="margin: 0 0 16px 0;">${greeting}</p>
    <p style="margin: 0 0 20px 0;">
      A new transaction has been recorded in your CashFlow account.
    </p>

    <!-- Amount Card -->
    <div style="margin: 20px 0; padding: 24px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; text-align: center;">
      <span style="display: inline-block; padding: 4px 10px; background-color: #e0e7ff; color: #3730a3; border-radius: 9999px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
        ${typeLabel}
      </span>
      <div style="font-size: 32px; font-weight: 800; color: #0f172a; margin: 10px 0 4px 0;">
        ${formattedAmount}
      </div>
      <div style="font-size: 15px; color: #475569; font-weight: 500;">
        ${data.description}
      </div>

      <table role="presentation" width="100%" style="margin-top: 18px; border-top: 1px solid #e2e8f0; text-align: left;">
        ${detailsRows}
      </table>
    </div>

    ${actionButtonHtml}
  `;

  const contentText = `
Transaction Recorded

${greeting}

A new transaction was recorded in your CashFlow account:

Amount: ${formattedAmount}
Description: ${data.description}
Type: ${typeLabel}
Date: ${formattedDate}
${data.groupName ? `Group: ${data.groupName}\n` : ''}${data.accountName ? `Account: ${data.accountName}\n` : ''}
${data.actionUrl ? `View in CashFlow: ${data.actionUrl}\n` : ''}
  `;

  return {
    subject,
    html: renderBaseHtml({
      title: subject,
      previewText: `${formattedAmount} ${data.description} recorded on CashFlow.`,
      contentHtml,
      contentText,
      footerNote: 'You received this notification according to your CashFlow transaction alert settings.'
    }),
    text: renderBaseText({
      title: subject,
      contentHtml: '',
      contentText,
      footerNote: 'You received this notification according to your CashFlow transaction alert settings.'
    })
  };
}

