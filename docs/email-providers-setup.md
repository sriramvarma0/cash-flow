# CashFlow Dual Email Provider Configuration

CashFlow features a provider-independent transactional email architecture supporting two enterprise providers simultaneously:
1. **Google Gmail API via OAuth2**
2. **Resend API with a custom authenticated domain**

The active provider is chosen strictly via the `EMAIL_PROVIDER` environment variable, enabling seamless switching between development, staging, and production without any codebase modifications.

---

## 1. Quick Environment Switching

To switch providers, update `EMAIL_PROVIDER` in your environment file (`backend/.env` or container environment variables) and restart the service:

```bash
# Switch to Google Gmail API
EMAIL_PROVIDER=gmail

# Or switch to Resend API
EMAIL_PROVIDER=resend
```

### Safety Guarantees
- **Strict single-provider execution:** If the active provider fails, CashFlow logs the error and raises an exception. It **never** silently falls back to the other provider to prevent accidental sender identity or domain leaks.
- **Fail-fast startup validation:** Missing credentials for the active provider are detected immediately during application bootstrap.
- **Idempotency protection:** Re-delivering an email with the same idempotency key returns the cached result to prevent duplicate emails to users.
- **Security & Privacy:** Credentials, OAuth tokens, and sensitive email bodies are never logged. Recipient email addresses are masked in logs (e.g., `u***@example.com`).

---

## 2. Option A: Google Gmail API (OAuth2) Setup

The Gmail provider uses Google's official REST API (`users.messages.send`) authenticated with OAuth 2.0 refresh tokens.

### Required Environment Variables

```env
EMAIL_PROVIDER=gmail
GMAIL_USER="notifications@yourdomain.com"
GMAIL_CLIENT_ID="1234567890-abcdefgh.apps.googleusercontent.com"
GMAIL_CLIENT_SECRET="GOCSPX-your_client_secret"
GMAIL_REFRESH_TOKEN="1//04abcdefgh_your_refresh_token"
EMAIL_REQUEST_TIMEOUT_MS=10000
```

### Step-by-Step Google Cloud Configuration

1. **Create or Select a Google Cloud Project:**
   - Navigate to the [Google Cloud Console](https://console.cloud.google.com/).
   - Create a new project (e.g., `CashFlow-Production`).

2. **Enable the Gmail API:**
   - Go to **APIs & Services > Library**.
   - Search for **Gmail API** and click **Enable**.

3. **Configure the OAuth Consent Screen:**
   - Go to **APIs & Services > OAuth consent screen**.
   - Select **External** (or **Internal** if using Google Workspace for your organization).
   - Enter your App name (`CashFlow`), User support email, and Developer contact information.
   - Under **Scopes**, add the Gmail send scope:
     `https://www.googleapis.com/auth/gmail.send`
   - If in "Testing" mode, add your `GMAIL_USER` email address as a **Test User**.

4. **Create OAuth 2.0 Client Credentials:**
   - Go to **APIs & Services > Credentials > Create Credentials > OAuth client ID**.
   - Application type: **Web application** (or **Desktop app**).
   - Name: `CashFlow Email Backend`.
   - Authorized redirect URIs:
     `https://developers.google.com/oauthplayground` (useful for initial token generation).
   - Click **Create** and copy your **Client ID** and **Client Secret**.

5. **Generate the Refresh Token:**
   - Open [Google OAuth 2.0 Playground](https://developers.google.com/oauthplayground).
   - Click the gear icon (⚙️) on the top-right:
     - Check **Use your own OAuth credentials**.
     - Paste your **OAuth Client ID** and **OAuth Client Secret**.
   - In Step 1 (Select & authorize APIs), enter:
     `https://www.googleapis.com/auth/gmail.send`
   - Click **Authorize APIs** and sign in with your `GMAIL_USER` Google account.
   - In Step 2 (Exchange authorization code for tokens), click **Exchange authorization code for tokens**.
   - Copy the resulting **Refresh token** into `GMAIL_REFRESH_TOKEN`.

---

## 3. Option B: Resend API (Custom Domain) Setup

The Resend provider connects via Resend's REST API using an API key and a custom DNS-verified domain (e.g., `cashflow.dev`).

### Required Environment Variables

```env
EMAIL_PROVIDER=resend
RESEND_API_KEY="re_123456789_abcdefg"
EMAIL_FROM="CashFlow <notifications@yourverifieddomain.com>"
EMAIL_REQUEST_TIMEOUT_MS=10000
```

### Step-by-Step Resend Configuration

1. **Sign Up & Create an API Key:**
   - Sign up or log in at [resend.com](https://resend.com).
   - Go to **API Keys > Create API Key**.
   - Name: `CashFlow Production`.
   - Permission: **Full access** or **Sending access**.
   - Copy the API key (`re_...`) into `RESEND_API_KEY`.

2. **Add & Verify Your Domain:**
   - Go to **Domains > Add Domain**.
   - Enter your domain (e.g., `yourverifieddomain.com` or subdomain `mail.yourverifieddomain.com`).
   - Resend provides DNS records to add at your DNS registrar (Cloudflare, Route53, Namecheap, etc.):
     - **DKIM:** `resend._domainkey` (TXT)
     - **SPF:** `bounces` (MX & TXT)
     - **DMARC:** `_dmarc` (TXT `v=DMARC1; p=none;`)
   - Wait for DNS propagation and click **Verify Domain**. Once verified, status changes to `Verified`.

3. **Configure `EMAIL_FROM`:**
   - Set `EMAIL_FROM` using your verified domain:
     `EMAIL_FROM="CashFlow <notifications@yourverifieddomain.com>"`

---

## 4. Reusable Shared Email Templates

Templates produce both responsive HTML and plain-text output, completely independent of the selected provider.

| Template | Method | Primary Parameters |
|---|---|---|
| **Account Verification** | `emailService.sendAccountVerification(to, data)` | `name`, `verificationUrl`, `code`, `expiresInMinutes` |
| **Password Reset** | `emailService.sendPasswordReset(to, data)` | `name`, `resetUrl`, `expiresInMinutes`, `ipAddress` |
| **Group Invitation** | `emailService.sendGroupInvitation(to, data)` | `recipientName`, `inviterName`, `groupName`, `inviteUrl`, `message` |
| **Transaction Notification** | `emailService.sendTransactionNotification(to, data)` | `recipientName`, `transactionType`, `amount`, `currency`, `description`, `date`, `groupName`, `accountName` |
| **Account Notification** | `emailService.sendAccountNotification(to, data)` | `recipientName`, `title`, `message`, `actionUrl`, `actionText`, `metadata` |

### Code Example

```typescript
import { EmailService } from './email/email.service';

@Injectable()
export class AuthService {
  constructor(private readonly emailService: EmailService) {}

  async sendVerification(email: string, token: string) {
    await this.emailService.sendAccountVerification(email, {
      name: 'Alex',
      verificationUrl: `https://cashflow.dev/verify?token=${token}`,
      code: '492810',
      expiresInMinutes: 15
    });
  }
}
```

---

## 5. Verification & Testing

CashFlow includes an automated unit and integration test suite with mocked APIs (no real emails sent during automated testing).

Run the email test suite:

```bash
# From workspace root:
npm run test:email

# Or directly in backend:
cd backend
npm run test:email
```

The test suite validates:
- Active provider selection (`gmail` vs `resend`).
- Detection and error reporting for missing environment variables.
- RFC 2822 MIME generation and OAuth2 token handling for Gmail.
- REST API payload and header formatting for Resend.
- Handling of API failures (rate limits, unverified domains, invalid credentials).
- Validation of recipient email syntax.
- HTML and plain-text rendering across all 5 templates.
- Strict isolation ensuring no accidental cross-provider fallback.
- Idempotency caching preventing duplicate email delivery.

