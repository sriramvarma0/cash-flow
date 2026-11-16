export interface BaseTemplateOptions {
  title: string;
  previewText?: string;
  contentHtml: string;
  contentText: string;
  footerNote?: string;
}

export function renderBaseHtml(options: BaseTemplateOptions): string {
  const currentYear = new Date().getFullYear();
  const previewSnippet = options.previewText
    ? `<div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${options.previewText}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="ie=edge">
  <title>${options.title}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f4f5f7;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #1f2937;
      -webkit-font-smoothing: antialiased;
    }
    table {
      border-collapse: collapse;
    }
    .wrapper {
      width: 100%;
      background-color: #f4f5f7;
      padding: 32px 16px;
    }
    .container {
      max-width: 580px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 12px;
      border: 1px solid #e5e7eb;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }
    .header {
      padding: 24px 32px;
      background-color: #0f172a;
      text-align: left;
    }
    .logo {
      font-size: 20px;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: -0.5px;
      text-decoration: none;
    }
    .logo-badge {
      display: inline-block;
      background-color: #10b981;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-right: 6px;
    }
    .body {
      padding: 32px;
      font-size: 15px;
      line-height: 1.6;
      color: #374151;
    }
    .btn {
      display: inline-block;
      background-color: #2563eb;
      color: #ffffff !important;
      font-weight: 600;
      font-size: 14px;
      padding: 12px 24px;
      border-radius: 8px;
      text-decoration: none;
      text-align: center;
      margin: 20px 0;
    }
    .footer {
      padding: 24px 32px;
      background-color: #f9fafb;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      font-size: 12px;
      color: #6b7280;
      line-height: 1.5;
    }
    .footer a {
      color: #4b5563;
      text-decoration: underline;
    }
  </style>
</head>
<body>
  ${previewSnippet}
  <table role="presentation" class="wrapper" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center">
        <table role="presentation" class="container" width="100%" cellpadding="0" cellspacing="0">
          <!-- Header -->
          <tr>
            <td class="header">
              <a href="#" class="logo">
                <span class="logo-badge"></span>CashFlow
              </a>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td class="body">
              ${options.contentHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td class="footer">
              ${options.footerNote ? `<p style="margin: 0 0 8px 0;">${options.footerNote}</p>` : ''}
              <p style="margin: 0;">&copy; ${currentYear} CashFlow Financial Management. All rights reserved.</p>
              <p style="margin: 4px 0 0 0;">This is an automated system email. Please do not reply directly to this message.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function renderBaseText(options: BaseTemplateOptions): string {
  const currentYear = new Date().getFullYear();
  const divider = '------------------------------------------------------------';
  return [
    `=== CashFlow Financial Management ===`,
    divider,
    '',
    options.contentText.trim(),
    '',
    divider,
    options.footerNote ? options.footerNote : '',
    `(c) ${currentYear} CashFlow. All rights reserved.`,
    'This is an automated transactional message. Please do not reply.'
  ]
    .filter(Boolean)
    .join('\n');
}

