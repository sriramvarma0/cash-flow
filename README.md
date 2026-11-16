# CashFlow

CashFlow is a personal finance monorepo with a Next.js frontend and a NestJS backend.

## Structure

- `frontend/` - Next.js app with Tailwind CSS and PWA-friendly routing
- `backend/` - NestJS API with Prisma and SQLite for local development

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure environment files:

```bash
copy backend\.env.example backend\.env
copy frontend\.env.example frontend\.env.local
```

3. Generate Prisma client:

```bash
npm run prisma:generate --workspace backend
```

4. Run the database migration:

```bash
npm run prisma:migrate --workspace backend
```

5. Start the apps in separate terminals:

```bash
npm run dev:backend
npm run dev:frontend
```

## Testing & Verification

Run the test suites:

```bash
# Run email provider verification test suite
npm run test:email

# Run full backend test suite
npm test
```

---

## MVP Features

- JWT authentication with multi-session support
- Provider-independent transactional email system (Gmail OAuth2 & Resend with custom domain) — see [Email Provider Setup Guide](file:///docs/email-providers-setup.md)
- Expense CRUD with dynamic tag and category management
- Shared expense groups & member invitations
- Interactive investment portfolio tracking & Yahoo Finance live quotes
- PWA & mobile-responsive design
