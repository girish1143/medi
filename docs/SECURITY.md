# Security

MediBook handles medical records, payment data and privileged administrative actions. The model is "deny by default, verify on the server, and keep defence in depth".

## 1. Threat model

| Threat | Mitigation |
| --- | --- |
| Credential stuffing / brute force | Auth-specific rate limiter, generic login errors, bcrypt cost factor, locked-down refresh sessions |
| Session theft | httpOnly + SameSite cookies, Secure in production, short access TTL, refresh rotation, SHA-256 hashed refresh tokens |
| Privilege escalation | Server-side RBAC on every route, role changes restricted to admins, no client-supplied roles trusted |
| IDOR | Ownership checks in services for appointments, prescriptions, records, invoices and payments |
| Double booking / race conditions | Transaction + advisory lock + GiST exclusion constraint + partial unique index |
| Payment tampering | Backend order creation, HMAC signature verification, independent webhook verification, never trust frontend status |
| Unauthorised file access | Private buckets, short-lived HMAC-signed URLs, MIME/size validation, no directory listing |
| SQL injection | Parameterised queries through repositories; Zod-validated input |
| XSS | React escaping, no `dangerouslySetInnerHTML` with user data, strict CSP-friendly markup |
| CSRF | SameSite cookies + CORS allow-list + JSON-only mutations; checkout/webhook verify signatures |
| Secret leakage | Env-only secrets, redacted logs, service-role key backend-only, `.env` git-ignored |
| Audit tampering | Append-only `audit_logs`, no update/delete policies for normal roles |

Out of scope here: host-level hardening, database backups and DDoS protection, which are handled by the hosting provider.

## 2. Authentication

- Two providers: local (development) and Supabase Auth (production). Local passwords live only in `dev_credentials` as bcrypt hashes and are never present in production.
- Access token: JWT, 15 minutes, `httpOnly`, `SameSite=Lax`, `Secure` in production.
- Refresh token: random 256-bit value, 7 days, stored as SHA-256 hash in `auth_sessions` with user agent and IP. Rotation on every refresh; logout revokes the row.
- The frontend never reads or stores tokens in `localStorage`.
- Password reset tokens are single-use and hashed at rest.
- Doctor self-registration creates a `pending` doctor; the account cannot appear publicly until an admin verifies it.

## 3. Authorization

Enforced in `middlewares/auth.ts` and again in services:

| Capability | Patient | Doctor | Reception | Admin |
| --- | --- | --- | --- | --- |
| Own profile / appointments | ✅ | ✅ | ✅ | ✅ |
| Other patients' clinical records | ❌ | only assigned | ❌ | metadata only |
| Create prescription | ❌ | own consultations | ❌ | ❌ |
| Verify/suspend doctors | ❌ | ❌ | ❌ | ✅ |
| Refunds | ❌ | ❌ | ❌ | ✅ |
| Platform settings | ❌ | ❌ | ❌ | ✅ |
| Audit log | ❌ | ❌ | ❌ | ✅ |
| Collect pay-at-clinic | ❌ | ✅ | ✅ | ✅ |

Notable rules:

- Receptionists are explicitly denied `patient.service.getPatientClinicalView` and the medical-records module.
- Doctors can only read patients with an appointment relationship.
- Patients can only read their own clinical view; `GET /patients/:id` does not expose other patients.
- Admins cannot change their own role or grant `doctor` through the role endpoint; doctors are provisioned via onboarding.
- Cancelling a paid online appointment triggers a server-side refund.

## 4. Database security (RLS)

`0002_rls.sql` enables RLS on every application table and defines policies using `auth.uid()` and helper predicates (`is_admin()`, doctor/patient relationship checks). The API uses the service role, so RLS is a second layer: even a leaked anon key cannot read another patient's rows through PostgREST.

Key properties:

- Patients select only their own `profiles`, `patients`, `appointments`, `prescriptions`, `medical_records`, `reviews`, `notifications`, `user_addresses` and `complaints`.
- Doctors select their own doctor row, their appointments and related patient summaries; availability and time off are self-managed.
- Public read is limited to verified/active doctors, active specialties, clinics and availability.
- `audit_logs` are selectable only by admins and never writable by clients.
- Storage buckets are private; access is through signed URLs only.

## 5. Secrets management

- All secrets are environment variables. No key is hardcoded in source or committed.
- `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` are backend-only.
- The frontend exposes only `NEXT_PUBLIC_*` values, and Razorpay's public key id.
- Production startup fails closed unless:
  - `AUTH_PROVIDER=supabase` and `STORAGE_PROVIDER=supabase`
  - `PAYMENTS_MODE=razorpay` with all three Razorpay values
  - `COOKIE_SECURE=true`
  - `JWT_SECRET` does not start with the development prefix
  - Supabase URL and service role key are present
- Rotate `JWT_SECRET` to invalidate all access tokens; revoke `auth_sessions` to invalidate refresh tokens.

## 6. Payments

- Orders are created server-side; amounts come from the appointment's stored fee, never from the client.
- Checkout success is not trusted. The backend recomputes `HMAC_SHA256(order_id|payment_id, key_secret)` and compares with a timing-safe function.
- Webhooks use the raw request body and verify `x-razorpay-signature` before parsing. Handlers are idempotent on provider ids.
- Only verified capture marks an appointment paid/confirmed.
- Refunds are authorised by role and recorded with requester/processor and reason.
- `PAYMENTS_MODE=dev` routes are hard-disabled when `NODE_ENV=production`.

## 7. Medical documents

- Uploads are validated for MIME type and size (PDF, JPEG, PNG, WebP; 10 MB).
- Stored in private buckets outside the web root.
- Access requires an authenticated, authorised request that mints a signed URL with a 5-minute TTL (configurable).
- Local storage signatures are HMAC-SHA256 over bucket + path + expiry; tampering or expiry returns 403.
- Deletes are soft (`deleted_at`) so audit history is preserved.
- Administrators do not get clinical file access, only metadata.
- Logs never include file contents, tokens or record payloads.

## 8. Input validation and transport

- Every request body, query and param is validated with Zod; unknown fields are stripped.
- IDs are UUID-validated; dates are ISO with offset; pincodes are 6 digits; Indian mobile numbers are normalised.
- Parameterised SQL everywhere; no dynamic SQL from user input.
- Helmet sets security headers; CORS uses an explicit allow-list with credentials.
- Rate limiting: global + stricter auth limiter; responses include `Retry-After`.
- JSON body limit 1 MB; upload limit 10 MB; webhook raw body limit 2 MB.
- Errors return stable codes without stack traces or internal details.

## 9. Logging and auditing

- Pino redacts authorization headers, cookies, tokens, passwords and provider signatures.
- Request logs include method, path, status, latency and request id; no PHI.
- `audit_logs` capture actor, role, action, entity, metadata, IP and timestamp for:
  - doctor verification and suspension
  - user role changes
  - payments and refunds
  - specialty and clinic changes
  - platform settings
  - complaint resolution
- Audit entries are displayed in the admin panel with filterable metadata.

## 10. Operational checklist

- [ ] HTTPS enforced, HSTS enabled at the edge
- [ ] `NODE_ENV=production`, secure cookies, strict CORS
- [ ] Supabase RLS verified with an anon-key probe
- [ ] Razorpay webhook secret configured and signature test executed
- [ ] `JWT_SECRET` generated from a CSPRNG (≥ 32 bytes)
- [ ] Service-role key restricted to backend runtime
- [ ] Database backups and PITR enabled
- [ ] Log retention and access review configured
- [ ] Dependency audit (`npm audit`) reviewed before each release
- [ ] Rate-limit thresholds tuned for production traffic
- [ ] Demo accounts and seed data absent from production
