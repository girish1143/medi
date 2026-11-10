# Database Design (Prisma ORM + SQLite)

> **Primary Application ORM & Database:** Prisma 6+ with SQLite (`frontend/prisma/schema.prisma`, `DATABASE_URL="file:./dev.db"`)  
> **Seed Policy:** Zero dummy data. Schema and migrations initialize completely empty.

## 1. Design Principles & SQLite Adaptation

1. **UUID Primary Keys Everywhere:** All 20 Prisma models use `id String @id @default(uuid())` so identifiers remain globally unique, non-enumerable, and migration-portable across SQLite and PostgreSQL.
2. **Explicit Enum Alternatives (`String` + TypeScript/Zod + SQLite `CHECK`):**
   - SQLite does not support native Prisma `enum` blocks (`provider = "sqlite"`).
   - Every bounded domain state (`role`, `accountStatus`, `verificationStatus`, `status`, `priority`, `providerType`, `consentPurpose`, `authorizedProviderScope`, `paymentMethodType`, `outcome`) is stored as an explicit `String` column constrained by:
     - Runtime Zod enums and TypeScript `as const` tuples in `frontend/src/lib/domain/enums.ts`
     - SQLite `CHECK (...)` constraints embedded directly in the initial SQLite migration (`frontend/prisma/migrations/*/migration.sql`).
3. **Indexed Foreign Keys:** Unlike PostgreSQL or MySQL InnoDB, SQLite does not implicitly index foreign keys. Every foreign key column (`userId`, `adminRoleId`, `hospitalId`, `doctorId`, `leadId`, `planId`, `subscriptionId`, `invoiceId`, etc.) carries an explicit `@@index([...])` declaration.
4. **Integer Minor Units for Currency:** Monetary amounts (`consultationFeeMinor`, `priceMinor`, `subtotalMinor`, `taxMinor`, `totalMinor`, `amountMinor`, `refundedMinor`) use integer minor units (`Int`, e.g. cents/paise) paired with ISO-4217 currency strings to eliminate floating-point rounding bugs.
5. **Safe Deletion & Archival Policies:**
   - Core profile, clinical lead, consent, financial, and ticket relations specify `onDelete: Restrict` so destructive hard deletes cannot silently purge regulated records.
   - `User`, `Patient`, `Doctor`, `Hospital`, and `Lead` include explicit `deletedAt` / `archivedAt` timestamps for soft archival.
   - `AuditLog` uses `onDelete: SetNull` on `actorUserId` so historical compliance logs remain intact.

---

## 2. Complete 20-Model Inventory

### Group A: Identity & RBAC (Models 1–4)
| Model | Purpose | Key Constraints & Indexes |
| :--- | :--- | :--- |
| **`User`** | Unified account identity & credentials (`passwordHash` nullable for non-password providers) | `@unique` on `email`, `phone`; `@@index([adminRoleId])`, `@@index([role, accountStatus])`, `@@index([deletedAt])` |
| **`AdminRole`** | Administrative role definition (`SUPER_ADMIN`, `OPERATIONS_ADMIN`, `FINANCE_ADMIN`, `SUPPORT_ADMIN`) | `@unique` on `code`; `@@index([isActive])` |
| **`AdminPermission`** | Fine-grained `(resource, action)` permission catalog | `@unique` on `code`; `@@unique([resource, action])` |
| **`AdminRolePermission`** | M:N mapping linking `AdminRole` and `AdminPermission` | `@@unique([adminRoleId, permissionId])`; FK indexes on both keys |

### Group B: Patients, Hospitals & Doctors (Models 5–9)
| Model | Purpose | Key Constraints & Indexes |
| :--- | :--- | :--- |
| **`Patient`** | Patient demographic & geographic preferences | `@unique` on `userId` (1:1); `@@index([countryCode, stateProvince, city])`, `@@index([archivedAt])` |
| **`Hospital`** | Healthcare facility profile & KYC verification state | `@unique` on `userId`; `@@unique([countryCode, registrationNumber])`; composite eligibility index |
| **`HospitalDepartment`** | Clinical departments offered by a hospital | `@@unique([hospitalId, specializationCode])`; indexes on `hospitalId` & matching eligibility |
| **`Doctor`** | Physician profile, medical license & consultation mode | `@unique` on `userId`; `@@unique([licenseCountryCode, medicalLicenseNumber])`; composite eligibility index |
| **`DoctorSpecialization`** | M:N specialization capabilities per doctor | `@@unique([doctorId, specializationCode])`; indexes on `doctorId` & `(specializationCode, doctorId)` |

### Group C: Lead Management & Patient Consent (Models 10–13)
| Model | Purpose | Key Constraints & Indexes |
| :--- | :--- | :--- |
| **`Lead`** | Patient care enquiry (high-level intake; avoids excessive clinical storage) | `@@unique([patientId, idempotencyKey])`; indexes on `[patientId, createdAt]`, `[status, priority, createdAt]`, `[specialization, countryCode, locationState, locationCity, status]` |
| **`LeadAssignment`** | Routing record assigning a `Lead` to either a `Doctor` or `Hospital` | SQLite XOR check (`providerType` matches non-null `doctorId` or `hospitalId`) + partial unique indexes blocking duplicate `PENDING`/`ACCEPTED` assignments |
| **`LeadHistory`** | Append-oriented state transition & assignment audit trail | Indexes on `[leadId, createdAt]`, `assignmentId`, `actorUserId` |
| **`PatientConsent`** | Explicit, versioned patient consent governing data disclosure per lead | Indexes on `[patientId, leadId, status]` & `[leadId, status, consentPurpose]` |

#### Lead & Assignment Statuses
- **`Lead.status`**: `NEW` → `UNDER_REVIEW` → `QUALIFIED` → `ASSIGNED` → `CONTACTED` → `CONVERTED` | `REJECTED` | `CLOSED`
- **`Lead.priority`**: `LOW` | `MEDIUM` | `HIGH` | `URGENT`
- **`LeadAssignment.status`**: `PENDING` | `ACCEPTED` | `REJECTED` | `EXPIRED` | `REVOKED`

### Group D: Billing, Notifications, Support & Audit (Models 14–20)
| Model | Purpose | Key Constraints & Indexes |
| :--- | :--- | :--- |
| **`SubscriptionPlan`** | Provider lead subscription plans & monthly quotas | `@unique` on `code`; `@@index([isActive, targetProviderType])` |
| **`Subscription`** | Active provider plan entitlements & period lead consumption | Indexes on `planId`, `[doctorId, status]`, `[hospitalId, status]`, `[status, currentPeriodEnd]` |
| **`Invoice`** | Billing statement tied to `Subscription` | `@unique` on `invoiceNumber`; indexes on `subscriptionId`, `[doctorId, status]`, `[hospitalId, status]` |
| **`Payment`** | Tokenized gateway transaction record (no raw card/CVV storage) | `@unique` on `idempotencyKey`; `@@unique([gatewayProvider, gatewayPaymentId])` |
| **`Notification`** | Multi-channel notification queue & in-app inbox | Indexes on `[recipientUserId, readAt, createdAt]`, `[status, channel]` |
| **`SupportTicket`** | Patient/provider/admin support cases | `@unique` on `ticketNumber`; indexes on requester, assignee, `leadId`, `[status, priority, createdAt]` |
| **`AuditLog`** | Compliance ledger recording authentication, PHI consent checks & admin mutations | Indexes on `[actorUserId, createdAt]`, `[resourceType, resourceId, createdAt]`, `[action, createdAt]` |
