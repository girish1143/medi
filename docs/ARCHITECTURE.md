# Architecture

## 1. System overview

MediBook is split into two independently deployable applications that share only the REST contract.

```
Browser
  │
  ├── Next.js 15 (App Router, React 19)
  │     ├── Public site, auth pages, booking wizard
  │     ├── Patient / Doctor / Reception / Admin workspaces
  │     └── TanStack Query + fetch client (credentials: include)
  │
  ▼  HTTPS, JSON, httpOnly cookies
Express 4 API  (/api/v1)
  ├── middleware: helmet, CORS allow-list, rate limit, cookies, Zod validation
  ├── controllers  → HTTP only
  ├── services     → rules, transactions, authorization
  ├── repositories → SQL
  ├── integrations → Supabase, Razorpay, email/SMS, PDF
  └── jobs         → reminders, unpaid-booking expiry
  │
  ▼  pg Pool (service-role connection)
PostgreSQL 18 (local embedded) / Supabase PostgreSQL (production)
  ├── migrations + RLS policies + storage buckets
  └── btree_gist exclusion constraint for booking safety
```

The frontend never talks to the database. It also never decides authorization or payment outcomes; both are enforced server-side.

## 2. Repository layout

```
backend/
  src/
    config/        env, logger, pg pool, migrations, seeds, embedded Postgres
    middlewares/   auth, RBAC, validation, rate limit, error handler
    validators/    Zod schemas per domain
    controllers/   request/response mapping
    services/      business logic and transactions
    repositories/  parameterised SQL
    integrations/  supabase, razorpay, email, sms, pdf
    jobs/          scheduled reminders and expiry
    routes/        versioned route composition
    app.ts         Express app factory
    server.ts      bootstrap: DB wait → migrate/seed → listen
  supabase/
    migrations/    0001_init.sql, 0002_rls.sql, 0003_storage.sql
    seed.sql
  tests/           Vitest suites
frontend/
  src/app/         routes (public, auth, patient, doctor, admin, reception)
  src/components/  ui primitives, dashboard shell, shared states
  src/hooks/       auth and query hooks
  src/lib/         API client, formatters, navigation config
  src/types/       shared API types
docs/
scripts/           api-smoke.ps1
```

## 3. Authentication

Two providers behind one interface:

| Provider | Identity | When |
| --- | --- | --- |
| `local` | `auth.users` shim + bcrypt hashes in a dev-only `dev_credentials` table | local development, tests |
| `supabase` | Supabase Auth (`auth.admin.createUser`, token verification) | production |

Login flow:

1. `POST /auth/login` validates credentials.
2. The API issues a short-lived JWT access token (15 min) and a random refresh token (7 days).
3. Both are set as `httpOnly` cookies (`mb_access`, `mb_refresh`); the refresh token's SHA-256 hash and metadata are stored in `auth_sessions`.
4. Every API request authenticates from the cookie or `Authorization: Bearer`.
5. `POST /auth/refresh` rotates the refresh token. The frontend API client retries a single 401 automatically after a refresh.
6. `POST /auth/logout` revokes the session row and clears cookies.

Passwords are never stored on application tables. The frontend never receives tokens in JSON.

Role enforcement lives in `middlewares/auth.ts` (`authenticate`, `requireAdmin`, `requireDoctor`, `requireStaff`, `requirePatient`). Ownership checks are repeated in services (for example, a doctor can only read patients they have appointments with).

## 4. Booking workflow

```
Patient picks doctor → date → slot (GET /doctors/:id/slots)
        │
        ▼
POST /appointments  (Zod validated)
        │
        ▼
BEGIN
  pg_advisory_xact_lock(7841, hash(doctor_id))      -- serialise per doctor
  re-read availability, time-off, notice window
  re-check requested slot against active appointments
  INSERT appointment (pending or confirmed)
  INSERT appointment_status_history
  INSERT payment row (pending) when online payment is required
COMMIT
        │
        ├── pay-at-clinic → appointment confirmed
        └── online → POST /payments/orders → provider order
```

Even if two requests pass the pre-check simultaneously, the database rejects the second write through:

- `appointments_no_overlap` — GiST exclusion constraint on `(doctor_id, tstzrange(starts_at, ends_at))` for active statuses
- `appointments_active_slot_uniq` — partial unique index on `(doctor_id, starts_at)`

Availability is computed from `doctor_availability` minus breaks, `doctor_time_off`, existing active appointments, minimum notice and maximum advance window. Times are stored as `timestamptz` (UTC) and formatted with `Asia/Kolkata` in the UI.

Status transitions:

```
pending → confirmed → checked_in → in_progress → completed
   │           │            │
   ├→ rejected ├→ cancelled ├→ no_show
   └→ cancelled
```

Doctors may complete `confirmed` appointments directly when no check-in is needed. Every transition is written to `appointment_status_history` with actor, previous and new status.

## 5. Payment workflow

### Razorpay mode

1. Backend validates the appointment and creates an order through Razorpay REST.
2. The order id is stored on the `payments` row (`created`).
3. Frontend opens Razorpay Checkout using the public key id.
4. Checkout returns `order_id`, `payment_id`, `signature`.
5. `POST /payments/verify` recomputes `HMAC_SHA256(order_id + "|" + payment_id, key_secret)` and compares in constant time.
6. The webhook (`POST /payments/webhook`, raw body, HMAC-SHA256 of the raw payload) independently confirms capture.
7. Only then is the appointment marked `confirmed` / `paid` and notifications dispatched.

### Development mode

`PAYMENTS_MODE=dev` issues `order_dev_*` and `pay_dev_*` identifiers with a locally generated HMAC. The route is disabled in production. The same state machine is exercised end to end.

Refund rules: cancelling or rejecting an online-paid appointment creates a refund record and calls the provider (or the dev simulator). Staff can issue partial/full refunds from the admin payments page.

## 6. Notifications

`services/notification.service.ts` fans out to three channels:

- In-app rows in `notifications` (read/unread, bell + pages)
- Email (`console` or `resend`)
- SMS (`console` or `msg91`)

Exporting an idempotency key per event prevents duplicates. A background job runs every 10 minutes to enqueue 24-hour appointment reminders and expire unpaid `pending` bookings older than 30 minutes (which frees the slot).

## 7. Files and documents

- Medical records and avatars are uploaded through Multer with MIME/size validation.
- `STORAGE_PROVIDER=local` writes to `backend/storage/<bucket>` and serves signed, expiring URLs under `GET /api/v1/files/:bucket/*` (HMAC signature + expiry).
- `STORAGE_PROVIDER=supabase` uploads to private buckets and uses short-lived signed URLs.
- Prescriptions and invoices are generated as PDFs server-side (PDFKit) and streamed only to authorised users.

## 8. Observability and auditing

- Pino structured logs with redaction of cookies, authorization headers, tokens and secrets.
- `audit_logs` records privileged actions (role changes, doctor verification, settings, refunds, specialty/clinic changes) with actor, IP, entity and metadata.
- Health probes: `GET /health` (liveness) and `GET /health/ready` (database check).

## 9. Frontend composition

- Server components render layouts; interactive views are client components.
- TanStack Query owns server state with per-domain keys (`admin`, `doctor`, `patient`, `reception`). Mutations invalidate affected keys.
- Role-aware navigation is defined once in `lib/dashboard-nav.ts`.
- `DashboardShell` handles auth gating, mobile drawer, notifications and sign-out.
- Presence-only middleware redirects unauthenticated dashboard visits; real role enforcement stays on the API.
- Shared building blocks: `StatCard`, `EmptyState`, `ErrorState`, `Pagination`, `StatusBadge`, `ConfirmDialog`, Radix-based UI primitives.
