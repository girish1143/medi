# Setup guide

## 1. Prerequisites

- Node.js 20+ (project verified on Node 24)
- npm 10+
- ~500 MB free disk for dependencies and the embedded PostgreSQL data directory
- Docker is **not** required for local development

Optional for production-like work:

- A Supabase project (Auth + PostgreSQL + Storage)
- Razorpay test/live keys
- Resend or MSG91 credentials for real email/SMS

## 2. Install

From the repository root:

```bash
npm run install:all
```

This installs the root helper dependencies plus `backend/` and `frontend/` separately.

If your environment blocks npm lifecycle scripts, approve the esbuild binary used by Vitest/tsx (`allowScripts` is already declared in `backend/package.json`).

## 3. Environment variables

### backend/.env

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `5000` | API port |
| `NODE_ENV` | `development` | `production` enables fail-closed validation |
| `FRONTEND_URL` | `http://localhost:3000` | Used in emails/links |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated allow-list |
| `LOG_LEVEL` | `info` | pino level |
| `DATABASE_URL` | local DSN | `postgres://postgres:postgres@127.0.0.1:55432/medibook` |
| `DATABASE_SSL` | `false` | `true` for Supabase |
| `DEV_EMBEDDED_PG` | `true` | Boot local PostgreSQL automatically |
| `DEV_PG_PORT` | `55432` | Local database port |
| `DEV_PG_DIR` | `.pgdata` | Data directory relative to `backend/` |
| `SEED_ON_START` | `true` | Load demo data on boot |
| `AUTO_MIGRATE` | `true` | Apply migrations on boot |
| `AUTH_PROVIDER` | `local` | `local` or `supabase` |
| `JWT_SECRET` | dev value | ≥ 32 chars; must not start with `dev-` in production |
| `ACCESS_TOKEN_TTL_SECONDS` | `900` | Access cookie lifetime |
| `REFRESH_TOKEN_TTL_DAYS` | `7` | Refresh session lifetime |
| `COOKIE_SECURE` | `false` | Must be `true` in production |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | empty | Required when using Supabase |
| `SUPABASE_MEDICAL_BUCKET` / `SUPABASE_AVATAR_BUCKET` | `medical-records` / `avatars` | Private buckets |
| `STORAGE_PROVIDER` | `local` | `local` or `supabase` |
| `LOCAL_STORAGE_DIR` | `storage` | Local upload root |
| `SIGNED_URL_TTL_SECONDS` | `300` | Signed URL lifetime |
| `PAYMENTS_MODE` | `dev` | `dev` or `razorpay` |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | empty | Required in production |
| `RAZORPAY_CURRENCY` | `INR` | |
| `BOOKING_MIN_NOTICE_MINUTES` | `60` | Earliest bookable slot |
| `BOOKING_MAX_ADVANCE_DAYS` | `60` | Booking horizon |
| `CANCELLATION_MIN_HOURS` | `4` | Cut-off for cancellation |
| `RESCHEDULE_MIN_HOURS` | `4` | Cut-off for rescheduling |
| `PAY_AT_CLINIC_ENABLED` | `true` | Global switch |
| `EMAIL_PROVIDER` | `console` | `console` or `resend` |
| `EMAIL_FROM` | dev sender | |
| `EMAIL_API_KEY` | empty | |
| `SMS_PROVIDER` | `console` | `console` or `msg91` |
| `SMS_API_KEY` | empty | |
| `REMINDER_CRON_ENABLED` | `true` | Reminder + expiry jobs |
| `RATE_LIMIT_WINDOW_MINUTES` / `RATE_LIMIT_MAX` | `15` / `600` | Global limiter |

### frontend/.env.local

| Variable | Default | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:5000/api/v1` | API base |
| `NEXT_PUBLIC_APP_URL` | empty | Canonical public URL |
| `NEXT_PUBLIC_DEMO_MODE` | `false` | Shows demo credential quick-fill on auth pages |

Never commit `.env` files. Both are ignored by git.

## 4. Start

```bash
npm run dev
```

Startup sequence:

1. `backend` waits for PostgreSQL. With `DEV_EMBEDDED_PG=true` it starts the bundled PostgreSQL 18 on `127.0.0.1:55432`, creating `backend/.pgdata` on first run.
2. Migrations (`0001`–`0003`) run.
3. Reference + demo seed data is applied.
4. Background jobs start.
5. API listens on `:5000`; Next.js listens on `:3000`.

Useful commands:

```bash
npm run dev:backend        # API only
npm run dev:frontend       # web only
cd backend && npm run db:migrate
cd backend && npm run db:seed
cd backend && npm run db:reset
```

## 5. Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@medibook.in` | `Admin@12345` |
| Reception | `reception@medibook.in` | `Reception@12345` |
| Doctor | `arjun.mehta@medibook.in` | `Doctor@12345` |
| Patient | `priya.sharma@example.com` | `Patient@12345` |

Demo data is development-only. New doctors created from the admin panel receive a temporary password shown once.

## 6. Verify the installation

```bash
curl http://localhost:5000/health/ready

powershell -ExecutionPolicy Bypass -File scripts/api-smoke.ps1
```

Expected: 43 checks pass, covering booking, payment, doctor completion, prescriptions, reception and admin flows plus authorization boundaries.

## 7. Troubleshooting

### API says "Waiting for PostgreSQL to become available"

- Confirm `127.0.0.1:55432` is listening: `Test-NetConnection 127.0.0.1 -Port 55432`.
- Check `backend/.pgdata/postmaster.pid`. If the PID is gone, delete the file and restart.
- If the port is open but queries hang, an orphaned `postgres.exe` child may still hold the socket. Stop all `postgres.exe` processes and restart. The current code detects a non-answering port and recovers automatically on Windows.

### `EADDRINUSE :::5000`

Another API instance is running. Stop it (`Get-NetTCPConnection -LocalPort 5000` to find the PID) before starting again.

### Next.js reports `@next/swc-win32-x64-msvc ... blocked by Application Control policy`

The native SWC binary is blocked on this machine, so Next falls back to the slower WASM compiler. The first dev start can take ~50 seconds and the first page compile ~10 seconds; subsequent requests are fast. No code change is required. If policy allows, allow-list the file for faster builds.

### Build exits with code 1 but prints "Compiled successfully"

When piping Next output through PowerShell, stderr warnings can surface as `NativeCommandError`. Run `npm run build *> build.log; $LASTEXITCODE` to confirm the real exit code (0 on success).

### Database reset

```bash
cd backend
npm run db:reset
```

If you need a completely fresh cluster, stop the API and delete `backend/.pgdata`; the next start re-initialises it.

## 8. Production deployment

### Database

1. Create a Supabase project.
2. Apply `supabase/migrations/0001`–`0003` using the Supabase CLI or SQL editor.
3. Create private buckets `medical-records` and `avatars`.
4. Set `DATABASE_URL` to the Supabase connection string with `DATABASE_SSL=true`.
5. Do **not** run seed/demo data.

### Backend

Set at minimum:

```ini
NODE_ENV=production
AUTH_PROVIDER=supabase
STORAGE_PROVIDER=supabase
PAYMENTS_MODE=razorpay
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
RAZORPAY_KEY_ID=...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
JWT_SECRET=<strong random 32+ chars>
COOKIE_SECURE=true
CORS_ORIGINS=https://app.example.com
FRONTEND_URL=https://app.example.com
DEV_EMBEDDED_PG=false
AUTO_MIGRATE=false
SEED_ON_START=false
```

The API refuses to start if any production requirement is missing.

Deploy `npm run build` + `npm start` behind HTTPS. Configure the Razorpay webhook URL as `https://api.example.com/api/v1/payments/webhook` and subscribe to `payment.captured`, `payment.failed`, `refund.processed`.

### Frontend

```ini
NEXT_PUBLIC_API_URL=https://api.example.com/api/v1
NEXT_PUBLIC_APP_URL=https://app.example.com
NEXT_PUBLIC_DEMO_MODE=false
```

Build with `npm run build` and start with `npm start`, or deploy to Vercel. The API and web app must share a site or use CORS with credentials; cookies are `httpOnly`, `SameSite=Lax` and `Secure` in production.

### Post-deploy checks

- `GET /health/ready` returns `database: connected`
- Login sets both cookies and `/auth/me` returns the right role
- A booking creates a Razorpay order and the webhook confirms it
- Signed medical-record URLs expire
- `CORS_ORIGINS` rejects unknown origins
- Audit log records an admin settings change
