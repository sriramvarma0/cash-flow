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

This creates a local `dev.db` SQLite database in the backend folder. The schema is structured so it can later be migrated to PostgreSQL with Prisma when you're ready.
The migration script creates a simple backup copy at `backend/prisma/dev.db.bak` before applying schema changes.

5. Start the apps in separate terminals:

```bash
npm run dev:backend
npm run dev:frontend
```

## MVP Features

- JWT authentication with register and login flows
- Expense CRUD with filters
- Dashboard cards, tables, and charts
- Clean separation between API, services, DTOs, and Prisma data access
