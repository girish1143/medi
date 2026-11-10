-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "fullName" TEXT NOT NULL,
    "passwordHash" TEXT,
    "role" TEXT NOT NULL DEFAULT 'PATIENT' CHECK ("role" IN ('SUPER_ADMIN', 'OPERATIONS_ADMIN', 'FINANCE_ADMIN', 'SUPPORT_ADMIN', 'PATIENT', 'DOCTOR', 'HOSPITAL')),
    "accountStatus" TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION' CHECK ("accountStatus" IN ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED')),
    "adminRoleId" TEXT,
    "emailVerified" DATETIME,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" DATETIME,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_adminRoleId_fkey" FOREIGN KEY ("adminRoleId") REFERENCES "AdminRole" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AdminRole" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL CHECK ("code" IN ('SUPER_ADMIN', 'OPERATIONS_ADMIN', 'FINANCE_ADMIN', 'SUPPORT_ADMIN')),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystemRole" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AdminPermission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AdminRolePermission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "adminRoleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "grantedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminRolePermission_adminRoleId_fkey" FOREIGN KEY ("adminRoleId") REFERENCES "AdminRole" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AdminRolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "AdminPermission" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "dateOfBirth" DATETIME,
    "gender" TEXT CHECK ("gender" IS NULL OR "gender" IN ('FEMALE', 'MALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY', 'OTHER')),
    "preferredLanguage" TEXT NOT NULL DEFAULT 'en',
    "city" TEXT,
    "stateProvince" TEXT,
    "postalCode" TEXT,
    "countryCode" TEXT,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Patient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Hospital" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "registrationNumber" TEXT NOT NULL,
    "accreditationBody" TEXT,
    "accreditationNumber" TEXT,
    "verificationStatus" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("verificationStatus" IN ('PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'SUSPENDED')),
    "verifiedAt" DATETIME,
    "verifiedByUserId" TEXT,
    "rejectionReason" TEXT,
    "isAcceptingLeads" BOOLEAN NOT NULL DEFAULT false,
    "offersTeleconsultation" BOOLEAN NOT NULL DEFAULT false,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "stateProvince" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "websiteUrl" TEXT,
    "bedCapacity" INTEGER CHECK ("bedCapacity" IS NULL OR "bedCapacity" >= 0),
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Hospital_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Hospital_verifiedByUserId_fkey" FOREIGN KEY ("verifiedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HospitalDepartment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hospitalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "specializationCode" TEXT NOT NULL,
    "specializationName" TEXT NOT NULL,
    "headDoctorName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isAcceptingLeads" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HospitalDepartment_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Doctor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "primaryHospitalId" TEXT,
    "medicalLicenseNumber" TEXT NOT NULL,
    "licensingAuthority" TEXT NOT NULL,
    "licenseCountryCode" TEXT NOT NULL,
    "licenseExpiresAt" DATETIME,
    "verificationStatus" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("verificationStatus" IN ('PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'SUSPENDED')),
    "verifiedAt" DATETIME,
    "verifiedByUserId" TEXT,
    "rejectionReason" TEXT,
    "qualificationSummary" TEXT,
    "yearsOfExperience" INTEGER NOT NULL DEFAULT 0 CHECK ("yearsOfExperience" >= 0),
    "consultationMode" TEXT NOT NULL DEFAULT 'IN_PERSON' CHECK ("consultationMode" IN ('IN_PERSON', 'TELECONSULTATION', 'BOTH')),
    "consultationFeeMinor" INTEGER CHECK ("consultationFeeMinor" IS NULL OR "consultationFeeMinor" >= 0),
    "currency" TEXT,
    "isAcceptingLeads" BOOLEAN NOT NULL DEFAULT false,
    "city" TEXT NOT NULL,
    "stateProvince" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "bio" TEXT,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Doctor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Doctor_primaryHospitalId_fkey" FOREIGN KEY ("primaryHospitalId") REFERENCES "Hospital" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Doctor_verifiedByUserId_fkey" FOREIGN KEY ("verifiedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DoctorSpecialization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "doctorId" TEXT NOT NULL,
    "specializationCode" TEXT NOT NULL,
    "specializationName" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "boardCertified" BOOLEAN NOT NULL DEFAULT false,
    "yearsExperience" INTEGER CHECK ("yearsExperience" IS NULL OR "yearsExperience" >= 0),
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DoctorSpecialization_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patientId" TEXT NOT NULL,
    "specialization" TEXT NOT NULL,
    "locationCity" TEXT NOT NULL,
    "locationState" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "consultationMode" TEXT NOT NULL DEFAULT 'IN_PERSON' CHECK ("consultationMode" IN ('IN_PERSON', 'TELECONSULTATION', 'BOTH')),
    "enquiryDescription" TEXT NOT NULL,
    "leadSource" TEXT NOT NULL DEFAULT 'WEB_PORTAL' CHECK ("leadSource" IN ('WEB_PORTAL', 'MOBILE_APP', 'REFERRAL', 'PARTNER_API', 'SUPPORT_ASSISTED')),
    "status" TEXT NOT NULL DEFAULT 'NEW' CHECK ("status" IN ('NEW', 'UNDER_REVIEW', 'QUALIFIED', 'ASSIGNED', 'CONTACTED', 'CONVERTED', 'REJECTED', 'CLOSED')),
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM' CHECK ("priority" IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
    "idempotencyKey" TEXT NOT NULL,
    "qualifiedAt" DATETIME,
    "qualifiedByUserId" TEXT,
    "closedAt" DATETIME,
    "closureReason" TEXT,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Lead_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Lead_qualifiedByUserId_fkey" FOREIGN KEY ("qualifiedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LeadAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT NOT NULL,
    "providerType" TEXT NOT NULL CHECK ("providerType" IN ('DOCTOR', 'HOSPITAL')),
    "doctorId" TEXT,
    "hospitalId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'REVOKED')),
    "assignedByUserId" TEXT,
    "matchScore" REAL CHECK ("matchScore" IS NULL OR ("matchScore" >= 0 AND "matchScore" <= 100)),
    "assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME,
    "acceptedAt" DATETIME,
    "rejectedAt" DATETIME,
    "rejectionReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LeadAssignment_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LeadAssignment_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LeadAssignment_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LeadAssignment_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CHECK (("providerType" = 'DOCTOR' AND "doctorId" IS NOT NULL AND "hospitalId" IS NULL) OR ("providerType" = 'HOSPITAL' AND "hospitalId" IS NOT NULL AND "doctorId" IS NULL))
);

-- CreateTable
CREATE TABLE "LeadHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "actorUserId" TEXT,
    "eventType" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "reason" TEXT,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeadHistory_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LeadHistory_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "LeadAssignment" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LeadHistory_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PatientConsent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patientId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "consentPurpose" TEXT NOT NULL CHECK ("consentPurpose" IN ('PLATFORM_TRIAGE', 'PROVIDER_CONTACT_DISCLOSURE', 'TELEHEALTH_COMMUNICATION')),
    "authorizedProviderScope" TEXT NOT NULL CHECK ("authorizedProviderScope" IN ('MATCHED_PROVIDERS', 'SPECIFIC_DOCTOR', 'SPECIFIC_HOSPITAL')),
    "authorizedDoctorId" TEXT,
    "authorizedHospitalId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'GRANTED' CHECK ("status" IN ('GRANTED', 'REVOKED', 'EXPIRED')),
    "consentVersion" TEXT NOT NULL,
    "grantedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME,
    "revokedAt" DATETIME,
    "revocationReason" TEXT,
    "ipHash" TEXT,
    "userAgentHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PatientConsent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PatientConsent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PatientConsent_authorizedDoctorId_fkey" FOREIGN KEY ("authorizedDoctorId") REFERENCES "Doctor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PatientConsent_authorizedHospitalId_fkey" FOREIGN KEY ("authorizedHospitalId") REFERENCES "Hospital" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SubscriptionPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "targetProviderType" TEXT NOT NULL CHECK ("targetProviderType" IN ('DOCTOR', 'HOSPITAL', 'BOTH')),
    "billingCycle" TEXT NOT NULL CHECK ("billingCycle" IN ('MONTHLY', 'QUARTERLY', 'ANNUAL')),
    "priceMinor" INTEGER NOT NULL CHECK ("priceMinor" >= 0),
    "currency" TEXT NOT NULL,
    "monthlyLeadQuota" INTEGER NOT NULL CHECK ("monthlyLeadQuota" >= 0),
    "featuresJson" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "providerType" TEXT NOT NULL CHECK ("providerType" IN ('DOCTOR', 'HOSPITAL')),
    "doctorId" TEXT,
    "hospitalId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'TRIALING' CHECK ("status" IN ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED')),
    "currentPeriodStart" DATETIME NOT NULL,
    "currentPeriodEnd" DATETIME NOT NULL,
    "leadsAllocatedInPeriod" INTEGER NOT NULL DEFAULT 0 CHECK ("leadsAllocatedInPeriod" >= 0),
    "leadsConsumedInPeriod" INTEGER NOT NULL DEFAULT 0 CHECK ("leadsConsumedInPeriod" >= 0 AND "leadsConsumedInPeriod" <= "leadsAllocatedInPeriod"),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "cancelledAt" DATETIME,
    "gatewayProvider" TEXT,
    "gatewaySubscriptionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Subscription_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Subscription_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK (("providerType" = 'DOCTOR' AND "doctorId" IS NOT NULL AND "hospitalId" IS NULL) OR ("providerType" = 'HOSPITAL' AND "hospitalId" IS NOT NULL AND "doctorId" IS NULL))
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceNumber" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "providerType" TEXT NOT NULL CHECK ("providerType" IN ('DOCTOR', 'HOSPITAL')),
    "doctorId" TEXT,
    "hospitalId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT' CHECK ("status" IN ('DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE')),
    "subtotalMinor" INTEGER NOT NULL CHECK ("subtotalMinor" >= 0),
    "taxMinor" INTEGER NOT NULL DEFAULT 0 CHECK ("taxMinor" >= 0),
    "totalMinor" INTEGER NOT NULL CHECK ("totalMinor" = "subtotalMinor" + "taxMinor"),
    "currency" TEXT NOT NULL,
    "issuedAt" DATETIME,
    "dueAt" DATETIME,
    "paidAt" DATETIME,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Invoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Invoice_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Invoice_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK (("providerType" = 'DOCTOR' AND "doctorId" IS NOT NULL AND "hospitalId" IS NULL) OR ("providerType" = 'HOSPITAL' AND "hospitalId" IS NOT NULL AND "doctorId" IS NULL))
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subscriptionId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "providerType" TEXT NOT NULL CHECK ("providerType" IN ('DOCTOR', 'HOSPITAL')),
    "doctorId" TEXT,
    "hospitalId" TEXT,
    "gatewayProvider" TEXT NOT NULL,
    "gatewayPaymentId" TEXT NOT NULL,
    "gatewayCustomerId" TEXT,
    "paymentMethodType" TEXT NOT NULL CHECK ("paymentMethodType" IN ('CARD_TOKEN', 'UPI', 'ACH', 'WIRE', 'NETBANKING', 'OTHER')),
    "amountMinor" INTEGER NOT NULL CHECK ("amountMinor" > 0),
    "refundedMinor" INTEGER NOT NULL DEFAULT 0 CHECK ("refundedMinor" >= 0 AND "refundedMinor" <= "amountMinor"),
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING', 'REQUIRES_ACTION', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED')),
    "idempotencyKey" TEXT NOT NULL,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "paidAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Payment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Payment_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Payment_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK (("providerType" = 'DOCTOR' AND "doctorId" IS NOT NULL AND "hospitalId" IS NULL) OR ("providerType" = 'HOSPITAL' AND "hospitalId" IS NOT NULL AND "doctorId" IS NULL))
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recipientUserId" TEXT NOT NULL,
    "channel" TEXT NOT NULL CHECK ("channel" IN ('IN_APP', 'EMAIL', 'SMS', 'PUSH')),
    "templateKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "payloadJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED' CHECK ("status" IN ('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'READ')),
    "relatedEntityType" TEXT,
    "relatedEntityId" TEXT,
    "sentAt" DATETIME,
    "readAt" DATETIME,
    "failedReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Notification_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketNumber" TEXT NOT NULL,
    "requesterUserId" TEXT NOT NULL,
    "assignedAdminUserId" TEXT,
    "leadId" TEXT,
    "category" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM' CHECK ("priority" IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    "status" TEXT NOT NULL DEFAULT 'OPEN' CHECK ("status" IN ('OPEN', 'IN_PROGRESS', 'WAITING_ON_USER', 'RESOLVED', 'CLOSED')),
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "resolutionNotes" TEXT,
    "resolvedAt" DATETIME,
    "closedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SupportTicket_requesterUserId_fkey" FOREIGN KEY ("requesterUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SupportTicket_assignedAdminUserId_fkey" FOREIGN KEY ("assignedAdminUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SupportTicket_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorUserId" TEXT,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "outcome" TEXT NOT NULL DEFAULT 'SUCCESS' CHECK ("outcome" IN ('SUCCESS', 'DENIED', 'FAILURE')),
    "requestId" TEXT,
    "ipHash" TEXT,
    "userAgentHash" TEXT,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE INDEX "User_adminRoleId_idx" ON "User"("adminRoleId");

-- CreateIndex
CREATE INDEX "User_role_accountStatus_idx" ON "User"("role", "accountStatus");

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdminRole_code_key" ON "AdminRole"("code");

-- CreateIndex
CREATE INDEX "AdminRole_isActive_idx" ON "AdminRole"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AdminPermission_code_key" ON "AdminPermission"("code");

-- CreateIndex
CREATE UNIQUE INDEX "AdminPermission_resource_action_key" ON "AdminPermission"("resource", "action");

-- CreateIndex
CREATE INDEX "AdminRolePermission_adminRoleId_idx" ON "AdminRolePermission"("adminRoleId");

-- CreateIndex
CREATE INDEX "AdminRolePermission_permissionId_idx" ON "AdminRolePermission"("permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminRolePermission_adminRoleId_permissionId_key" ON "AdminRolePermission"("adminRoleId", "permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_userId_key" ON "Patient"("userId");

-- CreateIndex
CREATE INDEX "Patient_countryCode_stateProvince_city_idx" ON "Patient"("countryCode", "stateProvince", "city");

-- CreateIndex
CREATE INDEX "Patient_archivedAt_idx" ON "Patient"("archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Hospital_userId_key" ON "Hospital"("userId");

-- CreateIndex
CREATE INDEX "Hospital_verifiedByUserId_idx" ON "Hospital"("verifiedByUserId");

-- CreateIndex
CREATE INDEX "Hospital_verificationStatus_isAcceptingLeads_countryCode_stateProvince_city_idx" ON "Hospital"("verificationStatus", "isAcceptingLeads", "countryCode", "stateProvince", "city");

-- CreateIndex
CREATE INDEX "Hospital_archivedAt_idx" ON "Hospital"("archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Hospital_countryCode_registrationNumber_key" ON "Hospital"("countryCode", "registrationNumber");

-- CreateIndex
CREATE INDEX "HospitalDepartment_hospitalId_idx" ON "HospitalDepartment"("hospitalId");

-- CreateIndex
CREATE INDEX "HospitalDepartment_specializationCode_isActive_isAcceptingLeads_idx" ON "HospitalDepartment"("specializationCode", "isActive", "isAcceptingLeads");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalDepartment_hospitalId_specializationCode_key" ON "HospitalDepartment"("hospitalId", "specializationCode");

-- CreateIndex
CREATE UNIQUE INDEX "Doctor_userId_key" ON "Doctor"("userId");

-- CreateIndex
CREATE INDEX "Doctor_primaryHospitalId_idx" ON "Doctor"("primaryHospitalId");

-- CreateIndex
CREATE INDEX "Doctor_verifiedByUserId_idx" ON "Doctor"("verifiedByUserId");

-- CreateIndex
CREATE INDEX "Doctor_verificationStatus_isAcceptingLeads_countryCode_stateProvince_city_idx" ON "Doctor"("verificationStatus", "isAcceptingLeads", "countryCode", "stateProvince", "city");

-- CreateIndex
CREATE INDEX "Doctor_archivedAt_idx" ON "Doctor"("archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Doctor_licenseCountryCode_medicalLicenseNumber_key" ON "Doctor"("licenseCountryCode", "medicalLicenseNumber");

-- CreateIndex
CREATE INDEX "DoctorSpecialization_doctorId_idx" ON "DoctorSpecialization"("doctorId");

-- CreateIndex
CREATE INDEX "DoctorSpecialization_specializationCode_doctorId_idx" ON "DoctorSpecialization"("specializationCode", "doctorId");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorSpecialization_doctorId_specializationCode_key" ON "DoctorSpecialization"("doctorId", "specializationCode");

-- CreateIndex
CREATE INDEX "Lead_patientId_createdAt_idx" ON "Lead"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "Lead_qualifiedByUserId_idx" ON "Lead"("qualifiedByUserId");

-- CreateIndex
CREATE INDEX "Lead_status_priority_createdAt_idx" ON "Lead"("status", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "Lead_specialization_countryCode_locationState_locationCity_status_idx" ON "Lead"("specialization", "countryCode", "locationState", "locationCity", "status");

-- CreateIndex
CREATE INDEX "Lead_archivedAt_idx" ON "Lead"("archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_patientId_idempotencyKey_key" ON "Lead"("patientId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "LeadAssignment_leadId_status_idx" ON "LeadAssignment"("leadId", "status");

-- CreateIndex
CREATE INDEX "LeadAssignment_leadId_doctorId_status_idx" ON "LeadAssignment"("leadId", "doctorId", "status");

-- CreateIndex
CREATE INDEX "LeadAssignment_leadId_hospitalId_status_idx" ON "LeadAssignment"("leadId", "hospitalId", "status");

-- CreateIndex
CREATE INDEX "LeadAssignment_doctorId_status_idx" ON "LeadAssignment"("doctorId", "status");

-- CreateIndex
CREATE INDEX "LeadAssignment_hospitalId_status_idx" ON "LeadAssignment"("hospitalId", "status");

-- CreateIndex
CREATE INDEX "LeadAssignment_assignedByUserId_idx" ON "LeadAssignment"("assignedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "uq_lead_assignment_active_doctor" ON "LeadAssignment"("leadId", "doctorId") WHERE "doctorId" IS NOT NULL AND "status" IN ('PENDING', 'ACCEPTED');

-- CreateIndex
CREATE UNIQUE INDEX "uq_lead_assignment_active_hospital" ON "LeadAssignment"("leadId", "hospitalId") WHERE "hospitalId" IS NOT NULL AND "status" IN ('PENDING', 'ACCEPTED');

-- CreateIndex
CREATE INDEX "LeadHistory_leadId_createdAt_idx" ON "LeadHistory"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "LeadHistory_assignmentId_idx" ON "LeadHistory"("assignmentId");

-- CreateIndex
CREATE INDEX "LeadHistory_actorUserId_idx" ON "LeadHistory"("actorUserId");

-- CreateIndex
CREATE INDEX "PatientConsent_patientId_leadId_status_idx" ON "PatientConsent"("patientId", "leadId", "status");

-- CreateIndex
CREATE INDEX "PatientConsent_leadId_status_consentPurpose_idx" ON "PatientConsent"("leadId", "status", "consentPurpose");

-- CreateIndex
CREATE INDEX "PatientConsent_authorizedDoctorId_idx" ON "PatientConsent"("authorizedDoctorId");

-- CreateIndex
CREATE INDEX "PatientConsent_authorizedHospitalId_idx" ON "PatientConsent"("authorizedHospitalId");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPlan_code_key" ON "SubscriptionPlan"("code");

-- CreateIndex
CREATE INDEX "SubscriptionPlan_isActive_targetProviderType_idx" ON "SubscriptionPlan"("isActive", "targetProviderType");

-- CreateIndex
CREATE INDEX "Subscription_planId_idx" ON "Subscription"("planId");

-- CreateIndex
CREATE INDEX "Subscription_doctorId_status_idx" ON "Subscription"("doctorId", "status");

-- CreateIndex
CREATE INDEX "Subscription_hospitalId_status_idx" ON "Subscription"("hospitalId", "status");

-- CreateIndex
CREATE INDEX "Subscription_status_currentPeriodEnd_idx" ON "Subscription"("status", "currentPeriodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "Invoice_subscriptionId_idx" ON "Invoice"("subscriptionId");

-- CreateIndex
CREATE INDEX "Invoice_doctorId_status_idx" ON "Invoice"("doctorId", "status");

-- CreateIndex
CREATE INDEX "Invoice_hospitalId_status_idx" ON "Invoice"("hospitalId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Payment_subscriptionId_status_idx" ON "Payment"("subscriptionId", "status");

-- CreateIndex
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");

-- CreateIndex
CREATE INDEX "Payment_doctorId_idx" ON "Payment"("doctorId");

-- CreateIndex
CREATE INDEX "Payment_hospitalId_idx" ON "Payment"("hospitalId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_gatewayProvider_gatewayPaymentId_key" ON "Payment"("gatewayProvider", "gatewayPaymentId");

-- CreateIndex
CREATE INDEX "Notification_recipientUserId_readAt_createdAt_idx" ON "Notification"("recipientUserId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_status_channel_idx" ON "Notification"("status", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_ticketNumber_key" ON "SupportTicket"("ticketNumber");

-- CreateIndex
CREATE INDEX "SupportTicket_requesterUserId_status_idx" ON "SupportTicket"("requesterUserId", "status");

-- CreateIndex
CREATE INDEX "SupportTicket_assignedAdminUserId_status_idx" ON "SupportTicket"("assignedAdminUserId", "status");

-- CreateIndex
CREATE INDEX "SupportTicket_leadId_idx" ON "SupportTicket"("leadId");

-- CreateIndex
CREATE INDEX "SupportTicket_status_priority_createdAt_idx" ON "SupportTicket"("status", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_resourceType_resourceId_createdAt_idx" ON "AuditLog"("resourceType", "resourceId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");
