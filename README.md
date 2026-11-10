# MediBook

A production-oriented doctor appointment booking and healthcare management platform for the Indian market. MediBook combines a public discovery site with four role-based workspaces: patient, doctor, receptionist and administrator.

- **Currency:** INR (₹)
- **Timezone:** Asia/Kolkata (all timestamps stored in UTC)
- **Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS · Radix/shadcn-style UI · TanStack Query · React Hook Form + Zod · Recharts
- **API:** Express · TypeScript · Zod validation · PostgreSQL · JWT access/refresh cookies · Razorpay + dev payment simulator

---

## Project structure

```
hospital/
├── backend/            Express REST API (src/, supabase/migrations/, tests/)
├── frontend/           Next.js application (src/app, components, hooks, lib)
├── docs/               Architecture, schema, API, setup and security docs
├── scripts/            PowerShell smoke test for the full API workflow
├── package.json        Root helper scripts
└── README.md
```

Each app has its own `package.json` and can be developed and deployed independently. The frontend talks to the backend only through the versioned REST API under `/api/v1`.

---

## Running locally

### Prerequisites

- Node.js 20 or newer
- No Docker required: the backend can boot an embedded PostgreSQL 18 instance for local development

### 1. Install dependencies

```bash
npm run install:all
```

### 2. Environment files

`backend/.env` and `frontend/.env.local` are required. Use the checked-in development values as a starting point:

```ini
# backend/.env
PORT=5000
NODE_ENV=development
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/medibook
DEV_EMBEDDED_PG=true
DEV_PG_PORT=55432
AUTO_MIGRATE=true
SEED_ON_START=true
AUTH_PROVIDER=local
STORAGE_PROVIDER=local
PAYMENTS_MODE=dev
CORS_ORIGINS=http://localhost:3000
FRONTEND_URL=http://localhost:3000
```

```ini
# frontend/.env.local
NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1
```

Production requires Supabase Auth/storage and real Razorpay keys; startup validation refuses insecure production configuration.

### 3. Start both apps

From the repository root:

```bash
npm run dev
```

- Web app: <http://localhost:3000>
- API: <http://localhost:5000> (`/health`, `/health/ready`)
- Embedded PostgreSQL: `127.0.0.1:55432`, data in `backend/.pgdata`

The API applies migrations, the reference seed and demo data automatically on first start. Use the sub-commands `npm run dev:backend` / `npm run dev:frontend` to run them separately.

### 4. Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Administrator | `admin@medibook.in` | `Admin@12345` |
| Receptionist | `reception@medibook.in` | `Reception@12345` |
| Doctor | `arjun.mehta@medibook.in` | `Doctor@12345` |
| Patient | `priya.sharma@example.com` | `Patient@12345` |

Every seeded doctor uses `Doctor@12345`. Demo credentials exist only in the development database and are never provisioned in production.

---

## What is implemented

### Public site

- Home page with specialty search, featured doctors, how-it-works, trust signals and FAQ
- Doctor discovery with server-side search, filters, sorting, pagination, skeletons and empty states
- Doctor profile with qualifications, clinic, working hours, reviews and live slot availability
- Four-step booking wizard (type, date/slot, details, payment)

### Patient workspace

Dashboard, appointments (pay, reschedule, cancel, review, invoice), prescriptions with PDF download, health-record uploads with signed URLs, profile editing, notifications and support requests.

### Doctor workspace

Dashboard analytics, appointment queue, status transitions (`confirmed → checked_in → in_progress → completed`), clinical patient view, prescription builder with PDF, weekly availability, breaks, time-off/holidays, profile editor.

### Reception workspace

Front-desk queue, check-in, start consultation, collect pay-at-clinic payments, patient directory, walk-in registration with temporary credentials, and on-behalf booking.

### Admin workspace

13 modules, all backed by real APIs:

| Module | Route | Highlights |
| --- | --- | --- |
| Overview | `/admin` | KPIs, 14-day appointment trend, status donut, revenue, pending verification, top doctors, recent bookings |
| Analytics | `/admin/analytics` | Net revenue vs refunds, appointment trend, specialty demand, doctor performance with revenue share |
| Appointments | `/admin/appointments` | Server-side filters, detail dialog with status history and payment, status actions |
| Doctors | `/admin/doctors` | Verification workflow (verify/reject/suspend), search/tabs, doctor onboarding with temporary password |
| Patients | `/admin/patients` | Patient directory with search, pagination and account overview |
| Specialties | `/admin/specialties` | Create, edit, publish/hide; doctor counts; audit logged |
| Clinics | `/admin/clinics` | Create, edit, activate/deactivate locations |
| Users | `/admin/users` | Role filter, search, role changes (patient/admin/receptionist only) |
| Payments | `/admin/payments` | Ledger, provider/status filters, refunds tab, refund dialog |
| Reviews | `/admin/reviews` | Publish/hide moderation |
| Complaints | `/admin/complaints` | Triage statuses and resolution notes |
| Audit log | `/admin/audit` | Append-only privileged action trail with metadata viewer |
| Settings | `/admin/settings` | Booking rules, cancellation/reschedule policy, clinic and support details, maintenance and payment switches |

Every panel list has loading skeletons, empty states and error recovery. Mutations show toasts and invalidate affected queries.

---

## Booking safety

Double booking is prevented at the database layer, not just in the UI:

- `btree_gist` exclusion constraint (`appointments_no_overlap`) on doctor + time range
- Partial unique index on active slots
- `pg_advisory_xact_lock` per doctor for the critical section
- Full transaction around availability validation, appointment creation and payment initialisation

Appointment statuses: `pending`, `confirmed`, `checked_in`, `in_progress`, `completed`, `cancelled`, `rejected`, `no_show`, with history rows for every transition.

## Payments

- `PAYMENTS_MODE=dev` uses an HMAC-signed local simulator for development
- `PAYMENTS_MODE=razorpay` creates real orders via Razorpay REST, verifies checkout signatures and webhooks with HMAC-SHA256, and supports refunds
- The frontend response is never treated as proof of payment; the backend verifies or waits for the webhook

## Security

- httpOnly access/refresh cookies, refresh sessions stored as SHA-256 hashes
- Server-side RBAC on every route; patients never see other patients' records, receptionists cannot open clinical records or admin configuration
- Row Level Security policies in `supabase/migrations/0002_rls.sql`
- Private local file storage with HMAC-signed expiring URLs
- Zod validation, rate limiting, CORS allow-list, Helmet headers, audit logging, redacted structured logs

---

## Verification

```bash
# Type safety
cd backend && npm run typecheck
cd frontend && npm run typecheck

# Production builds
npm run build

# End-to-end API smoke test (server must be running)
powershell -ExecutionPolicy Bypass -File scripts/api-smoke.ps1
```

The smoke test currently covers 43 checks across the patient booking → payment → doctor completion → prescription → review path, reception walk-in and check-in flow, admin operations, and authorization boundaries.

---

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- [`docs/DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md)
- [`docs/API_DOCUMENTATION.md`](docs/API_DOCUMENTATION.md)
- [`docs/SETUP.md`](docs/SETUP.md)
- [`docs/SECURITY.md`](docs/SECURITY.md)

## Deployment notes

Deploy `frontend/` and `backend/` separately. Set `NODE_ENV=production` with Supabase Auth/storage, a strong `JWT_SECRET`, `COOKIE_SECURE=true`, real Razorpay keys and `CORS_ORIGINS` restricted to the deployed web origin. Run migrations against the production Supabase database before starting the API.
