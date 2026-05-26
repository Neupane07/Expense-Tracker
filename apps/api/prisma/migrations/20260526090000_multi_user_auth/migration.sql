-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MEMBER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "googleSubject" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "avatarUrl" TEXT,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSignedInAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "invitedById" TEXT NOT NULL,
    "acceptedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- Quarantine owner is intentionally not a Google identity and cannot sign in.
INSERT INTO "User" ("id", "email", "role", "updatedAt")
VALUES ('legacy_unassigned_owner', '__legacy_unassigned__@invalid.local', 'MEMBER', CURRENT_TIMESTAMP);

-- Add required financial ownership and assign every existing row to quarantine.
ALTER TABLE "Account" ADD COLUMN "userId" TEXT;
ALTER TABLE "Import" ADD COLUMN "userId" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "userId" TEXT;
ALTER TABLE "Rule" ADD COLUMN "userId" TEXT;

UPDATE "Account" SET "userId" = 'legacy_unassigned_owner';
UPDATE "Import" SET "userId" = 'legacy_unassigned_owner';
UPDATE "Transaction" SET "userId" = 'legacy_unassigned_owner';
UPDATE "Rule" SET "userId" = 'legacy_unassigned_owner';

ALTER TABLE "Account" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Import" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Transaction" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Rule" ALTER COLUMN "userId" SET NOT NULL;

-- Replace global/one-column relationship indexes with ownership-aware constraints.
DROP INDEX "Transaction_transactionHash_key";
DROP INDEX "Transaction_transactionDate_idx";
DROP INDEX "Transaction_accountId_idx";
DROP INDEX "Transaction_sourceType_idx";
DROP INDEX "Rule_priority_idx";
DROP INDEX "Rule_isActive_idx";

CREATE UNIQUE INDEX "User_googleSubject_key" ON "User"("googleSubject");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Invitation_email_key" ON "Invitation"("email");
CREATE UNIQUE INDEX "Invitation_acceptedById_key" ON "Invitation"("acceptedById");
CREATE INDEX "Invitation_invitedById_idx" ON "Invitation"("invitedById");
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE UNIQUE INDEX "Account_id_userId_key" ON "Account"("id", "userId");
CREATE INDEX "Account_userId_idx" ON "Account"("userId");
CREATE UNIQUE INDEX "Import_id_userId_key" ON "Import"("id", "userId");
CREATE INDEX "Import_userId_createdAt_idx" ON "Import"("userId", "createdAt");
CREATE UNIQUE INDEX "Transaction_userId_transactionHash_key" ON "Transaction"("userId", "transactionHash");
CREATE INDEX "Transaction_userId_transactionDate_idx" ON "Transaction"("userId", "transactionDate");
CREATE INDEX "Transaction_userId_accountId_idx" ON "Transaction"("userId", "accountId");
CREATE INDEX "Transaction_userId_sourceType_idx" ON "Transaction"("userId", "sourceType");
CREATE INDEX "Rule_userId_priority_idx" ON "Rule"("userId", "priority");
CREATE INDEX "Rule_userId_isActive_idx" ON "Rule"("userId", "isActive");

ALTER TABLE "Import" DROP CONSTRAINT "Import_accountId_fkey";
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_accountId_fkey";
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_importId_fkey";

ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Import" ADD CONSTRAINT "Import_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Import" ADD CONSTRAINT "Import_accountId_userId_fkey" FOREIGN KEY ("accountId", "userId") REFERENCES "Account"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_accountId_userId_fkey" FOREIGN KEY ("accountId", "userId") REFERENCES "Account"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_importId_userId_fkey" FOREIGN KEY ("importId", "userId") REFERENCES "Import"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "Rule" ADD CONSTRAINT "Rule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
