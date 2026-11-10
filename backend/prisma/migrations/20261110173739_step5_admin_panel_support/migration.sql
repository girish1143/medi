-- CreateTable
CREATE TABLE "ProviderDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "providerType" TEXT NOT NULL,
    "doctorId" TEXT,
    "hospitalId" TEXT,
    "documentType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageRef" TEXT NOT NULL,
    "reviewStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedByUserId" TEXT,
    "reviewedAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProviderDocument_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProviderDocument_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SupportTicketReply" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketId" TEXT NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "isInternalNote" BOOLEAN NOT NULL DEFAULT false,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupportTicketReply_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SupportTicketReply_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlatformSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "valueJson" TEXT NOT NULL,
    "description" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "ProviderDocument_doctorId_reviewStatus_idx" ON "ProviderDocument"("doctorId", "reviewStatus");

-- CreateIndex
CREATE INDEX "ProviderDocument_hospitalId_reviewStatus_idx" ON "ProviderDocument"("hospitalId", "reviewStatus");

-- CreateIndex
CREATE INDEX "SupportTicketReply_ticketId_createdAt_idx" ON "SupportTicketReply"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicketReply_senderUserId_idx" ON "SupportTicketReply"("senderUserId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformSetting_key_key" ON "PlatformSetting"("key");

-- CreateIndex
CREATE INDEX "PlatformSetting_category_idx" ON "PlatformSetting"("category");
