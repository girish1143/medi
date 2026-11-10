# Healthcare Lead Generation Platform

> **Current Phase:** Step 2 — Relational Database Architecture (Prisma ORM + SQLite + Auth.js) inside `frontend/`, preserving `frontend/`, `backend/`, `database/`, and `docs/` directory layout.

## Repository Structure

```text
hospital/
├── frontend/                # Next.js App Router + TypeScript + Prisma + SQLite + Auth.js
│   ├── prisma/
│   │   ├── schema.prisma    # 20 relational models (SQLite)
│   │   └── migrations/      # Initial SQLite migration + CHECK & partial unique constraints
│   ├── src/
│   │   ├── app/api/         # Auth.js route handler & DB connectivity /api/health probe
│   │   └── lib/             # Prisma singleton, password hashing, RBAC, consent & audit services
│   └── tests/               # Database connectivity, constraint & consent verification tests
├── backend/                 # Preserved Step 1 modular Express REST API boundary skeleton
├── database/                # Preserved Step 1 PostgreSQL / Supabase DDL reference migrations
└── docs/                    # Architecture, database, ER, security & migration guides
```

## Security & Zero-Dummy-Data Policies

- **Zero Dummy Data:** Both `frontend/prisma/` and `database/migrations/` contain zero fake patients, doctors, hospitals, leads, or transactions. The SQLite database initializes empty.
- **Server-Only Database Access:** `frontend/src/lib/db/prisma.ts` blocks browser bundling (`typeof window !== 'undefined'`) and reads `DATABASE_URL` via server-only validation (`frontend/src/lib/env.ts`).
- **Explicit Consent Gate:** `frontend/src/lib/services/consent.service.ts` verifies active `PatientConsent` + accepted `LeadAssignment` before releasing patient contact details and records every access or denial in `AuditLog`.
- **No Raw Payment Data:** `Payment` stores tokenized gateway identifiers only (no PAN, card numbers, or CVV).

## Setup & Verification (`frontend/`)

```bash
cd frontend
cp .env.example .env
# Generate AUTH_SECRET via: npx auth secret
npm install
npm run db:validate
npm run db:generate
npm run db:migrate
npm run db:status
npm run typecheck
npm run lint
npm test
```

## Documentation Index

- [Database Design](docs/DATABASE_DESIGN.md)
- [Entity Relationships](docs/ENTITY_RELATIONSHIPS.md)
- [Data Security](docs/DATA_SECURITY.md)
- [Migration Guide](docs/MIGRATION_GUIDE.md)
- [System Architecture](docs/SYSTEM_ARCHITECTURE.md)
- [User Roles and Permissions](docs/USER_ROLES_AND_PERMISSIONS.md)
- [Lead Workflow](docs/LEAD_WORKFLOW.md)
- [API Design](docs/API_DESIGN.md)
