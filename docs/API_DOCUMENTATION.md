# API documentation

Base URL: `http://localhost:5000/api/v1`

All application operations in the frontend go through this API. Authentication uses httpOnly cookies (`mb_access`, `mb_refresh`) or an `Authorization: Bearer <jwt>` header.

## Conventions

### Success envelope

```json
{
  "success": true,
  "message": "Operation successful",
  "data": {},
  "meta": {}
}
```

Paginated lists add:

```json
{
  "meta": {
    "pagination": { "page": 1, "limit": 12, "total": 57, "totalPages": 5 }
  }
}
```

Query parameters: `page` (default 1), `limit` (default 12, max 100).

### Error envelope

```json
{
  "success": false,
  "message": "This time slot is no longer available",
  "code": "SLOT_UNAVAILABLE"
}
```

Validation errors also include `details` keyed by field.

| HTTP | Code | Meaning |
| --- | --- | --- |
| 400 | `INVALID_INPUT`, `UPLOAD_ERROR` | Malformed body or upload |
| 401 | `UNAUTHORIZED`, `INVALID_CREDENTIALS` | Missing/expired session or bad login |
| 402 | `PAYMENT_REQUIRED` | Online payment must be completed |
| 403 | `FORBIDDEN` | Role or ownership check failed |
| 404 | `NOT_FOUND`, `ROUTE_NOT_FOUND` | Unknown resource or route |
| 409 | `CONFLICT`, `SLOT_UNAVAILABLE`, `DUPLICATE_RECORD`, `EMAIL_IN_USE` | State conflict / double booking |
| 422 | `VALIDATION_ERROR` | Zod validation failure |
| 429 | `RATE_LIMITED` | Rate limit exceeded |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

## Health

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/health` | public | Liveness + uptime |
| GET | `/health/ready` | public | Database connectivity |

Note: health routes are mounted at the origin root, not under `/api/v1`.

## Authentication

| Method | Path | Auth | Body / notes |
| --- | --- | --- | --- |
| POST | `/auth/register` | public* | `fullName`, `email`, `phone?`, `password` |
| POST | `/auth/register-doctor` | public* | Doctor application: `fullName`, `email`, `password`, `qualification`, `registrationNumber`, `experienceYears`, `specialtyIds[]`, `consultationFee`, `onlineConsultationFee?`, `biography?`, `languages?` |
| POST | `/auth/login` | public* | `email`, `password`; sets cookies |
| POST | `/auth/refresh` | refresh cookie | Rotates refresh token |
| POST | `/auth/logout` | cookie | Revokes session, clears cookies |
| POST | `/auth/forgot-password` | public* | `email`; dev returns reset link when mailer is console |
| POST | `/auth/reset-password` | public* | `email`, `token`, `password` |
| POST | `/auth/verify-otp` | public* | `email`, `token` |
| GET | `/auth/me` | any | Current profile, role and patient/doctor ids |

\* Rate limited by `authLimiter`.

Login response `data`:

```json
{
  "user": {
    "id": "uuid",
    "fullName": "Priya Sharma",
    "email": "priya.sharma@example.com",
    "phone": "9876543210",
    "role": "patient",
    "avatarUrl": null,
    "patientId": "uuid",
    "doctorId": null
  }
}
```

## Public directory

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/doctors` | public | Search verified active doctors. Query: `q`, `specialty` (slug), `city`, `area`, `minFee`, `maxFee`, `minExperience`, `minRating`, `availableToday`, `consultationType`, `sort` (`rating`, `fee_asc`, `fee_desc`, `experience`, `name`, `next_available`), `page`, `limit` |
| GET | `/doctors/:id` | public | Full profile, clinics, specialties, working hours |
| GET | `/doctors/:id/slots` | public | `date=YYYY-MM-DD&type=in_clinic\|online` → available slots |
| GET | `/doctors/:id/reviews` | public | Visible reviews |
| GET | `/doctors/:id/working-hours` | public | Weekly schedule |
| GET | `/doctors/specialties` | public | Active specialties with doctor counts |
| GET | `/doctors/specialties/:slug` | public | Specialty and its doctors |

Slot response item:

```json
{ "startsAt": "2026-11-12T04:30:00.000Z", "endsAt": "2026-11-12T05:00:00.000Z", "label": "10:00 AM" }
```

## Appointments

All routes require authentication.

| Method | Path | Roles | Description |
| --- | --- | --- | --- |
| GET | `/appointments` | all roles (scoped) | Query: `view=upcoming\|past\|today\|all`, `status` (comma separated), `date`, `from`, `to`, `search`, `patientId`, `doctorId`, `sort`, `page`, `limit` |
| POST | `/appointments` | patient, reception, admin | Create booking (see below) |
| GET | `/appointments/:id` | involved parties | Detail with doctor, patient, clinic, payment, prescription |
| GET | `/appointments/:id/history` | involved parties | Status history |
| PATCH | `/appointments/:id/reschedule` | patient, staff | `startsAt` (ISO with offset), `reason?` |
| POST | `/appointments/:id/cancel` | patient, staff | `reason` (3–300 chars) |
| PATCH | `/appointments/:id/status` | doctor, staff, admin | `status` ∈ confirmed, checked_in, in_progress, completed, cancelled, rejected, no_show; `note?` |
| POST | `/appointments/:id/review` | patient | `rating` 1–5, `comment?`; appointment must be completed |
| GET | `/appointments/:id/invoice` | involved parties | PDF stream |
| POST | `/appointments/:id/collect-payment` | doctor, reception, admin | Records pay-at-clinic payment |

### Create booking

```json
{
  "doctorId": "uuid",
  "clinicId": "uuid?",
  "startsAt": "2026-11-12T04:30:00.000Z",
  "appointmentType": "in_clinic",
  "reason": "Persistent headache",
  "paymentOption": "online",
  "patientId": "uuid (staff only)"
}
```

Response:

```json
{
  "success": true,
  "message": "Appointment created",
  "data": {
    "appointment": {
      "id": "uuid",
      "appointmentNumber": "MB-1001",
      "status": "pending",
      "paymentStatus": "pending",
      "startsAt": "2026-11-12T04:30:00.000Z",
      "consultationFee": 800
    },
    "payment": { "required": true, "orderId": "order_...", "amount": 800, "currency": "INR" }
  }
}
```

`409 SLOT_UNAVAILABLE` is returned when another request takes the slot first, including under concurrency.

## Patients

| Method | Path | Roles | Description |
| --- | --- | --- | --- |
| GET | `/patients/me` | patient | Profile + patient record |
| PATCH | `/patients/me` | patient | `fullName`, `phone`, `address`, `dateOfBirth`, `gender`, `bloodGroup`, `emergencyContact` |
| GET | `/patients/me/dashboard` | patient | Counts, next appointment, recent activity |
| GET | `/patients` | doctor, staff | Directory (scoped) |
| GET | `/patients/:id` | doctor with relationship, staff (limited) | Patient summary; clinical view restricted |

## Doctor portal

Prefix `/doctor-portal`, role `doctor`.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/dashboard` | Today's queue, counts, earnings, completion rate, charts |
| GET / PATCH | `/profile` | Professional profile, fees, bio, languages |
| GET | `/schedule` | Availability + upcoming time off |
| PUT | `/availability` | Replace weekly schedule (`availability[]` with weekday, start, end, slotMinutes, break) |
| POST | `/time-off` | `startsAt`, `endsAt`, `reason?` |
| DELETE | `/time-off/:timeOffId` | Remove leave |
| GET | `/patients` | Assigned patients only |
| GET | `/patients/:id` | Clinical record for an assigned patient |

## Prescriptions

| Method | Path | Roles | Description |
| --- | --- | --- | --- |
| GET | `/prescriptions` | patient/doctor/admin, scoped | List |
| POST | `/prescriptions` | doctor | `appointmentId`, `diagnosis`, `notes?`, `followUpDate?`, `items[]` (medicine, dosage, frequency, duration, instructions?) |
| GET | `/prescriptions/:id` | involved parties | Detail with items |
| GET | `/prescriptions/:id/pdf` | involved parties | PDF download |

## Medical records

| Method | Path | Roles | Description |
| --- | --- | --- | --- |
| GET | `/medical-records` | patient, doctor | Query: `patientId`, `type`, `page`, `limit` |
| POST | `/medical-records` | patient, doctor | `multipart/form-data`: `file`, `recordType`, `patientId?`, `appointmentId?` |
| GET | `/medical-records/:id/download` | authorised | 302 to a signed URL, or stream |
| DELETE | `/medical-records/:id` | owner/uploader | Soft delete |

Accepted: PDF, JPEG, PNG, WebP; max 10 MB. Receptionists are denied.

## Reception

Prefix `/reception`, roles `receptionist` and `admin`.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/dashboard` | Queue counts and today's appointments |
| POST | `/patients` | Walk-in registration; returns temporary password |
| GET | `/patients` | Patient directory; `search`, `id`, `page`, `limit` |

## Admin

Prefix `/admin`, role `admin`.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/dashboard` | Stats, daily series, monthly revenue, distributions, top doctors, pending verification, recent bookings |
| GET | `/analytics` | Same aggregates for the analytics page |
| GET | `/users` | `role`, `search`, `page`, `limit` |
| PATCH | `/users/:id/role` | `role` ∈ patient, admin, receptionist (doctors use onboarding) |
| GET | `/doctors` | `status`, `search`, pagination |
| POST | `/doctors` | Create doctor; returns `temporaryPassword` when none supplied |
| PATCH | `/doctors/:id` | Update doctor profile |
| PATCH | `/doctors/:id/verification` | `status` ∈ pending, verified, rejected, suspended; `note?` |
| GET | `/payments` | `status`, `provider`, `search`, `from`, `to`, pagination |
| GET | `/refunds` | Refund records |
| GET / PATCH | `/settings` | Platform settings key/values |
| GET | `/audit-logs` | `action`, `entityType`, pagination |
| GET | `/complaints` | Paginated complaint list |
| PATCH | `/complaints/:id` | `status`, `resolution?` |
| GET | `/reviews` | Paginated reviews |
| PATCH | `/reviews/:id` | `isVisible` |
| GET | `/specialties` | All specialties incl. hidden, with doctor counts |
| POST | `/specialties` | `name`, `description?`, `icon?` |
| PATCH | `/specialties/:id` | `name?`, `description?`, `icon?`, `isActive?` |
| GET | `/clinics` | All clinics |
| POST | `/clinics` | `name`, `addressLine1`, `area?`, `city`, `state`, `pincode`, `phone?`, `email?` |
| PATCH | `/clinics/:id` | Any clinic field or `isActive` |

## Payments

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/payments/webhook` | HMAC header | Raw-body Razorpay webhook; verifies `x-razorpay-signature` |
| POST | `/payments/orders` | any signed-in | `{ appointmentId }` → provider order |
| POST | `/payments/verify` | any signed-in | `{ orderId, paymentId, signature }` |
| POST | `/payments/dev-confirm` | dev/test only | `{ orderId }` dev simulator |
| GET | `/payments/appointment/:appointmentId` | involved parties | Payment for an appointment |
| POST | `/payments/:paymentId/refund` | staff | `{ amount?, reason }` |

Webhook events handled: `payment.captured`, `payment.failed`, `refund.processed`. Handlers are idempotent by provider payment/refund id.

## Notifications

| Method | Path | Description |
| --- | --- | --- |
| GET | `/notifications` | `unread=true`, pagination |
| PATCH | `/notifications/:id/read` | Mark one read |
| POST | `/notifications/read-all` | Mark all read |

## Support

| Method | Path | Description |
| --- | --- | --- |
| GET | `/support` | Current user's complaints/tickets |
| POST | `/support` | `subject`, `description`, `appointmentId?` |

## Files

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/files/:bucket/*` | signed query | Local storage signed URL. Requires `expires` and `signature`; rejects tampering and expiry. |

## Rate limits

- Global API limiter: `RATE_LIMIT_MAX` per `RATE_LIMIT_WINDOW_MINUTES` (default 600 / 15 min).
- Authentication routes: stricter limiter to slow credential stuffing.
- Exceeding a limit returns `429 RATE_LIMITED` with `Retry-After`.
