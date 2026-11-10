# Healthcare Lead Generation Platform

> **Current Phase:** Decoupled Architecture — Express.js `/api/v1/` Backend + SQLite/Prisma (`backend/`) & Next.js App Router Frontend (`frontend/`, zero direct DB access).

## Repository Structure

```text
hospital/
├── backend/                 # Express.js + TypeScript + Prisma + SQLite + JWT Refresh Rotation + RBAC/ABAC
│   ├── prisma/
│   │   ├── schema.prisma    # Full relational models + Step 6 Session & PasswordResetToken
│   │   └── migrations/      # SQLite migrations (5 migrations applied, empty zero-dummy DB)
│   └── src/
│       ├── config/          # Env validation, Prisma singleton, CORS, security constants, Pino redaction
│       ├── security/        # Argon2id, HS256 JWTs, SHA-256 token hashes, HttpOnly cookies, RBAC catalog
│       ├── middleware/      # JWT auth, RBAC, ABAC ownership, Zod validation, rate limiting, CSRF
│       ├── modules/         # auth, users, sessions, permissions, patients, doctors, hospitals, leads, consent, admin
│       └── scripts/         # One-time Super Admin bootstrap CLI (bootstrap-admin.ts)
├── frontend/                # Next.js App Router + TypeScript + Tailwind CSS + Recharts (Zero Prisma)
│   ├── scripts/             # Windows WASM-aware Next.js CLI runner (run-next.mjs)
│   └── src/
│       ├── app/             # Auth UI, /admin/* Super Admin Panel, role portals & error boundaries
│       ├── components/      # Shared UI primitives & admin interactive workspaces
│       ├── services/        # Centralized api-client.ts (CSRF + refresh rotation) & auth.service.ts
│       └── lib/             # Server API forwarding helpers, UI nav/permission constants, enums
├── database/                # Pointer & documentation for backend/prisma SQLite architecture
├── scripts/                 # Monorepo setup, dev runner, backup, and environment validation scripts
└── docs/                    # Architecture, database, auth/RBAC, ER, security & API docs
```

## Security & Zero-Dummy-Data Policies

- **Zero Dummy Data:** `backend/prisma/` contains zero fake patients, doctors, hospitals, leads, or transactions. SQLite initializes completely empty.
- **Strict Decoupled Boundary:** `frontend/` contains zero Prisma packages, schemas, or direct database connections; all requests proxy/route to `backend` `/api/v1/*`.
- **Explicit Consent Gate:** `backend/src/modules/consent/consent.service.ts` verifies active `PatientConsent` + accepted `LeadAssignment` before releasing patient contact details and records every access or denial in `AuditLog`.
- **No Raw Payment Data:** `Payment` stores tokenized gateway identifiers only (no PAN, card numbers, or CVV).

## Setup & Verification

```bash
# 1. Backend (Express + Prisma SQLite on port 4000)
cd backend
cp .env.example .env
npm install
npm run db:validate
npm run db:generate
npm run db:deploy
npm run db:status
npm run typecheck
npm run lint
npm test
npm run build
npm run dev

# 2. Frontend (Next.js App Router on port 3000)
cd ../frontend
cp .env.example .env
npm install
npm run typecheck
npm run lint
npm test
npm run dev
```

### Super Admin Panel Routes (`/admin/*`)

Protected server-side by `requireAdminPageAccess` and fine-grained `AdminRolePermission` checks:
- `/admin` (Dashboard KPIs & Recharts visualizations from real SQLite data)
- `/admin/users`, `/admin/users/[id]` (User directory, profile detail, suspend/reactivate, admin provisioning)
- `/admin/doctors`, `/admin/doctors/[id]` (Doctor verification, document review, specializations)
- `/admin/hospitals`, `/admin/hospitals/[id]` (Hospital verification, document review, departments)
- `/admin/leads`, `/admin/leads/[id]` (Lead CRM, specialist matching, manual assignment/reassignment, consent-gated patient contact reveal)
- `/admin/subscriptions` (Subscription plan catalog & provider usage/expiry tracking)
- `/admin/payments` (Tokenized payments ledger, invoices & audited refunds)
- `/admin/analytics` (Operational analytics charts & formula-safe CSV export)
- `/admin/notifications` (Admin inbox & notification dispatch queue)
- `/admin/support` (Support ticket triage, assignment & replies/internal notes)
- `/admin/audit-logs` (Security & compliance audit event explorer with redacted metadata)
- `/admin/settings` (Persisted `PlatformSetting` configuration & RBAC permission matrix)

## Documentation Index

- [Authentication and RBAC](docs/AUTHENTICATION_AND_RBAC.md)
- [Database Design](docs/DATABASE_DESIGN.md)
- [Entity Relationships](docs/ENTITY_RELATIONSHIPS.md)
- [Data Security](docs/DATA_SECURITY.md)
- [Migration Guide](docs/MIGRATION_GUIDE.md)
- [System Architecture](docs/SYSTEM_ARCHITECTURE.md)
- [User Roles and Permissions](docs/USER_ROLES_AND_PERMISSIONS.md)
- [Lead Workflow](docs/LEAD_WORKFLOW.md)
- [API Design](docs/API_DESIGN.md)
