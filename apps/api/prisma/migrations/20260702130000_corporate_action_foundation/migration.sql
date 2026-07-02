-- CreateEnum
CREATE TYPE "CorporateActionEventType" AS ENUM ('SPLIT', 'BONUS', 'DIVIDEND', 'RIGHTS', 'SYMBOL_CHANGE', 'MERGER', 'DEMERGER', 'BUYBACK', 'OTHER');

-- CreateEnum
CREATE TYPE "CorporateActionSyncStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED', 'UNAVAILABLE');

-- CreateTable
CREATE TABLE "CorporateActionSyncRun" (
    "id" TEXT NOT NULL,
    "status" "CorporateActionSyncStatus" NOT NULL,
    "source" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "eventCount" INTEGER NOT NULL DEFAULT 0,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "correctedCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "rawMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CorporateActionSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorporateActionEvent" (
    "id" TEXT NOT NULL,
    "instrumentId" TEXT,
    "symbol" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "securityId" TEXT,
    "eventType" "CorporateActionEventType" NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "exDate" TIMESTAMP(3),
    "recordDate" TIMESTAMP(3),
    "ratioNumerator" DECIMAL(18,6),
    "ratioDenominator" DECIMAL(18,6),
    "cashAmount" DECIMAL(18,4),
    "source" TEXT NOT NULL,
    "sourceEventId" TEXT NOT NULL,
    "rawEvidence" JSONB NOT NULL,
    "invalidationFromDate" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "supersededAt" TIMESTAMP(3),
    "supersededById" TEXT,
    "syncRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CorporateActionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CorporateActionSyncRun_startedAt_idx" ON "CorporateActionSyncRun"("startedAt");

-- CreateIndex
CREATE INDEX "CorporateActionSyncRun_status_idx" ON "CorporateActionSyncRun"("status");

-- CreateIndex
CREATE INDEX "CorporateActionEvent_instrumentId_exDate_idx" ON "CorporateActionEvent"("instrumentId", "exDate");

-- CreateIndex
CREATE INDEX "CorporateActionEvent_symbol_exchange_effectiveDate_idx" ON "CorporateActionEvent"("symbol", "exchange", "effectiveDate");

-- CreateIndex
CREATE INDEX "CorporateActionEvent_processedAt_idx" ON "CorporateActionEvent"("processedAt");

-- CreateIndex
CREATE INDEX "CorporateActionEvent_supersededAt_idx" ON "CorporateActionEvent"("supersededAt");

-- CreateIndex
CREATE UNIQUE INDEX "CorporateActionEvent_source_sourceEventId_key" ON "CorporateActionEvent"("source", "sourceEventId");

-- AddForeignKey
ALTER TABLE "CorporateActionEvent" ADD CONSTRAINT "CorporateActionEvent_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorporateActionEvent" ADD CONSTRAINT "CorporateActionEvent_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "CorporateActionEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorporateActionEvent" ADD CONSTRAINT "CorporateActionEvent_syncRunId_fkey" FOREIGN KEY ("syncRunId") REFERENCES "CorporateActionSyncRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
