import { renderBaseHtml, renderBaseText } from './base.template';

export interface GroupInvitationTemplateData {
  recipientName?: string;
  inviterName: string;
  groupName: string;
  inviteUrl: string;
  message?: string;
}

export function groupInvitationTemplate(data: GroupInvitationTemplateData) {
  const subject = `You've been invited to join "${data.groupName}" on CashFlow`;
  const greeting = data.recipientName ? `Hello ${data.recipientName},` : 'Hello,';

  const personalMessageHtml = data.message
    ? `
      <div style="margin: 20px 0; padding: 16px; background-color: #f9fafb; border-left: 4px solid #3b82f6; border-radius: 4px; font-style: italic; color: #4b5563;">
        "${data.message}"
      </div>
    `
    : '';

  const personalMessageText = data.message ? `\nPersonal note from ${data.inviterName}:\n"${data.message}"\n` : '';

  const contentHtml = `
    <h1 style="font-size: 20px; font-weight: 700; color: #111827; margin: 0 0 16px 0;">Group Invitation</h1>
    <p style="margin: 0 0 16px 0;">${greeting}</p>
    <p style="margin: 0 0 20px 0;">
      <strong>${data.inviterName}</strong> has invited you to join the group <strong>"${data.groupName}"</strong> on CashFlow to track shared expenses, split bills, and manage balances together.
    </p>

    ${personalMessageHtml}

    <div style="text-align: center; margin: 28px 0;">
      <a href="${data.inviteUrl}" class="btn" style="background-color: #10b981; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; display: inline-block;">
        Accept Invitation
      </a>
    </div>

    <p style="font-size: 13px; color: #6b7280; margin: 24px 0 0 0;">
      If you don't already have a CashFlow account, you will be prompted to create one when accepting this invite.
    </p>

    <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; word-break: break-all;">
      Or copy and paste this URL into your browser:<br/>
      <a href="${data.inviteUrl}" style="color: #2563eb;">${data.inviteUrl}</a>
    </div>
  `;

  const contentText = `
Group Invitation

${greeting}

${data.inviterName} has invited you to join the group "${data.groupName}" on CashFlow to track shared expenses and balances.
${personalMessageText}
Accept the invitation here:
${data.inviteUrl}

If you do not have a CashFlow account, you can create one after opening the link.
  `;

  return {
    subject,
    html: renderBaseHtml({
      title: subject,
      previewText: `${data.inviterName} invited you to join "${data.groupName}" on CashFlow.`,
      contentHtml,
      contentText,
      footerNote: `Sent on behalf of ${data.inviterName} via CashFlow.`
    }),
    text: renderBaseText({
      title: subject,
      contentHtml: '',
      contentText,
      footerNote: `Sent on behalf of ${data.inviterName} via CashFlow.`
    })
  };
}

