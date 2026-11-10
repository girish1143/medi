# User Roles and Permissions

> **Scope:** Role taxonomy, Separation of Duties (SoD), server-side RBAC enforcement, and SQLite Prisma authorization across all 7 platform roles.

## 1. Platform Roles Overview

| Role Identifier | Category | Purpose & Scope |
| :--- | :--- | :--- |
| **`SUPER_ADMIN`** | Internal Admin | Platform governance, admin user provisioning, audit log inspection, system settings. |
| **`OPERATIONS_ADMIN`** | Internal Admin | Doctor and hospital KYC verification, lead qualification, assignment, and rejection. |
| **`FINANCE_ADMIN`** | Internal Admin | Subscription plans, subscriptions, invoices, and payment refunds. **Zero clinical PHI access.** |
| **`SUPPORT_ADMIN`** | Internal Admin | Support ticket management and non-PHI user troubleshooting. |
| **`PATIENT`** | External User | Submits healthcare enquiries (`Lead`), grants/revokes `PatientConsent`, requests appointments and contact callbacks. |
| **`DOCTOR`** | Healthcare Provider | Maintains verified clinical profile, responds to assigned leads, accepts consented contact details, manages appointments. |
| **`HOSPITAL`** | Healthcare Provider | Maintains verified facility & departments, responds to assigned leads, manages facility appointments. |

---

## 2. Server-Side Enforcement Model (`src/lib/auth/rbac.ts`, `src/middleware.ts`)

1. **Early Edge Protection (`src/middleware.ts`):** Redirects unauthenticated users from `/admin/*`, `/patient/*`, `/doctor/*`, and `/hospital/*` to `/login`, and cross-role access to `/access-denied`.
2. **Authoritative Server Verification (`requireAuthentication()`, `requireRole()`, `requirePermission()`):**
   - Validates Auth.js encrypted HTTP-only session cookie.
   - Re-queries SQLite `User` (`accountStatus === 'ACTIVE'`, `emailVerified !== null`, `deletedAt === null`, `sessionVersion` match) and `Session` (`expires > NOW()`).
   - For administrative operations, verifies `AdminRole.isActive` and `AdminRolePermission` grants directly in SQLite.
   - Records denied authorization attempts in `AuditLog` (`outcome = 'DENIED'`).
