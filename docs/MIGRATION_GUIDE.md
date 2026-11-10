# Database Migration & Connectivity Guide

> **ORM:** Prisma ORM (`@prisma/client` & `prisma`)  
> **Database:** SQLite (`file:./dev.db` relative to `frontend/prisma/schema.prisma`)  
> **Working Directory:** `frontend/`

## 1. Environment Setup

1. Copy the template environment file (never commit `.env`):
   ```bash
   cd frontend
   cp .env.example .env
   ```
2. Ensure `DATABASE_URL` points to the local SQLite database file:
   ```env
   DATABASE_URL="file:./dev.db"
   ```
3. Generate a cryptographic `AUTH_SECRET` for Auth.js:
   ```bash
   npx auth secret
   ```

## 2. Standard Prisma Workflows

| Task | Command | Notes |
| :--- | :--- | :--- |
| Validate schema syntax & relations | `npm run db:validate` (`npx prisma validate`) | Checks `prisma/schema.prisma` without altering DB |
| Generate TypeScript Prisma Client | `npm run db:generate` (`npx prisma generate`) | Updates `node_modules/@prisma/client` |
| Create & apply migration (dev) | `npm run db:migrate` (`npx prisma migrate dev`) | Applies SQLite migrations cleanly |
| Check migration status | `npm run db:status` (`npx prisma migrate status`) | Verifies DB matches `prisma/migrations/` |
| Apply migrations in production | `npx prisma migrate deploy` | Non-interactive, zero-reset deployment |

## 3. SQLite Constraints Added in Initial Migration

Because SQLite does not support native Prisma `enum` types or conditional unique indexes directly in `schema.prisma` attributes, the initial migration (`frontend/prisma/migrations/*/migration.sql`) includes:
- Domain `CHECK (...)` constraints on role, status, provider type, and consent columns.
- Exclusive provider XOR checks on `LeadAssignment`, `Subscription`, `Invoice`, and `Payment` (`providerType = 'DOCTOR'` requires `doctorId IS NOT NULL AND hospitalId IS NULL`, and vice versa).
- Partial unique indexes preventing duplicate `PENDING` or `ACCEPTED` assignments for the same `(leadId, doctorId)` or `(leadId, hospitalId)`.

## 4. Strict Data Preservation & Zero-Seed Rules

- **Never run `prisma migrate reset` or `--force-reset`** against shared or production databases without explicit approval.
- **No automatic dummy seeding:** The database starts completely empty. Genuine `AdminRole`, `AdminPermission`, and user accounts must be created through verified administrative bootstrap or registration flows.

## 5. Verifying Database Connectivity

Run the health API endpoint (`GET /api/health`) or unit verification tests (`npm test`) inside `frontend/`. The health handler executes `SELECT 1 AS ok` via `verifyDatabaseConnectivity()` and returns HTTP `200` when SQLite is reachable without exposing `DATABASE_URL`.
