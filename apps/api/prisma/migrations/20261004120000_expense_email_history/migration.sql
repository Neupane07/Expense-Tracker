-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "closedAt" DATE,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'INR',
ADD COLUMN     "openedAt" DATE,
ADD COLUMN     "reviewEverything" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "statementPassword" TEXT;

-- AlterTable
ALTER TABLE "Import" ADD COLUMN     "rawFile" BYTEA,
ADD COLUMN     "rawKeyVersion" TEXT,
ADD COLUMN     "rowErrors" JSONB;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "confirmation" TEXT NOT NULL DEFAULT 'POSTED',
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'INR',
ADD COLUMN     "merchantKey" TEXT,
ADD COLUMN     "postingDate" DATE,
ADD COLUMN     "reversalOfId" TEXT,
ADD COLUMN     "reviewReason" TEXT,
ADD COLUMN     "reviewStatus" TEXT NOT NULL DEFAULT 'NEEDS_REVIEW',
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "transferPairId" TEXT,
ALTER COLUMN "importId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Rule" ADD COLUMN     "accountId" TEXT,
ADD COLUMN     "direction" TEXT,
ADD COLUMN     "merchantKey" TEXT,
ADD COLUMN     "origin" TEXT NOT NULL DEFAULT 'USER';

-- CreateTable
CREATE TABLE "AccountIdentifier" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "sourceType" "SourceType" NOT NULL,
    "validFrom" DATE,
    "validTo" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountIdentifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "googleSubject" TEXT NOT NULL,
    "refreshToken" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PREVIEW',
    "lastCheckedAt" TIMESTAMP(3),
    "watermark" TIMESTAMP(3),
    "nextPollAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "errorCode" TEXT,
    "generation" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailOAuthState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "verifier" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailOAuthState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceDocument" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "connectionId" TEXT,
    "accountId" TEXT,
    "sourceKey" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "encryptedBytes" BYTEA,
    "metadata" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "parserVersion" TEXT,
    "errorCode" TEXT,
    "deletedAt" TIMESTAMP(3),
    "statementFrom" DATE,
    "statementTo" DATE,
    "coverageStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceObservation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "rowKey" TEXT NOT NULL,
    "parsed" JSONB NOT NULL,
    "rawRow" JSONB NOT NULL,
    "transactionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "generation" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "from" TIMESTAMP(3) NOT NULL,
    "to" TIMESTAMP(3) NOT NULL,
    "pageToken" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "leaseToken" TEXT,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewBatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ruleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undoneAt" TIMESTAMP(3),

    CONSTRAINT "ReviewBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassificationChange" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "afterRevision" INTEGER NOT NULL,
    "undone" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassificationChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountIdentifier_userId_value_idx" ON "AccountIdentifier"("userId", "value");

-- CreateIndex
CREATE UNIQUE INDEX "AccountIdentifier_accountId_value_sourceType_key" ON "AccountIdentifier"("accountId", "value", "sourceType");

-- CreateIndex
CREATE INDEX "EmailConnection_status_nextPollAt_idx" ON "EmailConnection"("status", "nextPollAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailConnection_userId_googleSubject_key" ON "EmailConnection"("userId", "googleSubject");

-- CreateIndex
CREATE UNIQUE INDEX "EmailConnection_id_userId_key" ON "EmailConnection"("id", "userId");

-- CreateIndex
CREATE INDEX "SourceDocument_userId_accountId_statementFrom_idx" ON "SourceDocument"("userId", "accountId", "statementFrom");

-- CreateIndex
CREATE INDEX "SourceDocument_userId_status_idx" ON "SourceDocument"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SourceDocument_userId_sourceKey_key" ON "SourceDocument"("userId", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "SourceDocument_id_userId_key" ON "SourceDocument"("id", "userId");

-- CreateIndex
CREATE INDEX "SourceObservation_userId_status_idx" ON "SourceObservation"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SourceObservation_documentId_rowKey_key" ON "SourceObservation"("documentId", "rowKey");

-- CreateIndex
CREATE INDEX "ExpenseJob_status_availableAt_idx" ON "ExpenseJob"("status", "availableAt");

-- CreateIndex
CREATE INDEX "ExpenseJob_userId_connectionId_idx" ON "ExpenseJob"("userId", "connectionId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewBatch_id_userId_key" ON "ReviewBatch"("id", "userId");

-- CreateIndex
CREATE INDEX "ClassificationChange_userId_transactionId_idx" ON "ClassificationChange"("userId", "transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_id_userId_key" ON "Transaction"("id", "userId");

-- AddForeignKey
ALTER TABLE "Rule" ADD CONSTRAINT "Rule_accountId_userId_fkey" FOREIGN KEY ("accountId", "userId") REFERENCES "Account"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountIdentifier" ADD CONSTRAINT "AccountIdentifier_accountId_userId_fkey" FOREIGN KEY ("accountId", "userId") REFERENCES "Account"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailConnection" ADD CONSTRAINT "EmailConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceDocument" ADD CONSTRAINT "SourceDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceDocument" ADD CONSTRAINT "SourceDocument_connectionId_userId_fkey" FOREIGN KEY ("connectionId", "userId") REFERENCES "EmailConnection"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceDocument" ADD CONSTRAINT "SourceDocument_accountId_userId_fkey" FOREIGN KEY ("accountId", "userId") REFERENCES "Account"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceObservation" ADD CONSTRAINT "SourceObservation_documentId_userId_fkey" FOREIGN KEY ("documentId", "userId") REFERENCES "SourceDocument"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceObservation" ADD CONSTRAINT "SourceObservation_transactionId_userId_fkey" FOREIGN KEY ("transactionId", "userId") REFERENCES "Transaction"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseJob" ADD CONSTRAINT "ExpenseJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseJob" ADD CONSTRAINT "ExpenseJob_connectionId_userId_fkey" FOREIGN KEY ("connectionId", "userId") REFERENCES "EmailConnection"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewBatch" ADD CONSTRAINT "ReviewBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassificationChange" ADD CONSTRAINT "ClassificationChange_batchId_userId_fkey" FOREIGN KEY ("batchId", "userId") REFERENCES "ReviewBatch"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassificationChange" ADD CONSTRAINT "ClassificationChange_transactionId_userId_fkey" FOREIGN KEY ("transactionId", "userId") REFERENCES "Transaction"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Preserve all existing decisions. Flag automatic card credits without rewriting them.
UPDATE "Transaction" t SET "reviewStatus" = CASE WHEN c."isManual" THEN 'USER_REVIEWED' WHEN c."expenseType" <> 'REVIEW' THEN 'AUTO_ACCEPTED' ELSE 'NEEDS_REVIEW' END
FROM "TransactionCategory" c WHERE c."transactionId" = t."id";
UPDATE "Transaction" t SET "reviewStatus" = 'NEEDS_REVIEW', "reviewReason" = 'Legacy card credit: verify repayment versus refund'
FROM "TransactionCategory" c WHERE c."transactionId" = t."id" AND NOT c."isManual" AND t."sourceType" = 'ICICI_AMAZON_PAY_CARD' AND t."moneyIn" > 0;
ALTER TABLE "Account" ADD CONSTRAINT "Account_lifecycle_dates" CHECK ("openedAt" IS NULL OR "closedAt" IS NULL OR "openedAt" <= "closedAt");
ALTER TABLE "AccountIdentifier" ADD CONSTRAINT "AccountIdentifier_valid_dates" CHECK ("validFrom" IS NULL OR "validTo" IS NULL OR "validFrom" <= "validTo");

-- Legacy imports retain their existing references without inventing original bytes or statement periods.
INSERT INTO "SourceDocument" ("id", "userId", "accountId", "sourceKey", "contentHash", "kind", "fileName", "mimeType", "metadata", "status", "parserVersion", "errorCode", "createdAt", "updatedAt")
SELECT 'legacy-import:' || "id", "userId", "accountId", 'legacy-import:' || "id", "fileHash", 'LEGACY_UPLOAD', "fileName", 'application/octet-stream', jsonb_build_object('importId', "id", 'originalFileAvailable', false), 'ORIGINAL_UNAVAILABLE', 'legacy-import', 'ORIGINAL_FILE_NOT_RETAINED', "createdAt", NOW()
FROM "Import";
INSERT INTO "SourceObservation" ("id", "userId", "documentId", "rowKey", "parsed", "rawRow", "transactionId", "status", "reason", "createdAt")
SELECT 'legacy-transaction:' || "id", "userId", 'legacy-import:' || "importId", "id", jsonb_build_object('legacyTransactionId', "id"), '{}'::jsonb, "id", 'POSTED', 'Original file and extracted row were not retained; existing transaction preserved', "createdAt"
FROM "Transaction" WHERE "importId" IS NOT NULL;
