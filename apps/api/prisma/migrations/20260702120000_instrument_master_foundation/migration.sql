-- CreateEnum
CREATE TYPE "InstrumentLifecycleStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DELISTED', 'RENAMED');

-- CreateEnum
CREATE TYPE "InstrumentMasterSyncStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "InstrumentMasterEntry" (
    "id" TEXT NOT NULL,
    "securityId" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "isin" TEXT,
    "instrumentName" TEXT NOT NULL,
    "instrumentType" TEXT NOT NULL,
    "series" TEXT,
    "lifecycleStatus" "InstrumentLifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "supersededBySymbol" TEXT,
    "supersededBySecurityId" TEXT,
    "buySellIndicator" TEXT,
    "source" TEXT NOT NULL DEFAULT 'DHAN_SCRIP_MASTER',
    "sourceRowHash" TEXT NOT NULL,
    "rawMetadata" JSONB NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstrumentMasterEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstrumentMasterSyncRun" (
    "id" TEXT NOT NULL,
    "status" "InstrumentMasterSyncStatus" NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "contentHash" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3),
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "upsertedCount" INTEGER NOT NULL DEFAULT 0,
    "deactivatedCount" INTEGER NOT NULL DEFAULT 0,
    "conflictCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "rawMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstrumentMasterSyncRun_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Instrument" ADD COLUMN "lifecycleStatus" "InstrumentLifecycleStatus",
ADD COLUMN "masterEntryId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "InstrumentMasterEntry_exchange_securityId_key" ON "InstrumentMasterEntry"("exchange", "securityId");

-- CreateIndex
CREATE INDEX "InstrumentMasterEntry_symbol_exchange_idx" ON "InstrumentMasterEntry"("symbol", "exchange");

-- CreateIndex
CREATE INDEX "InstrumentMasterEntry_isin_idx" ON "InstrumentMasterEntry"("isin");

-- CreateIndex
CREATE INDEX "InstrumentMasterEntry_lifecycleStatus_idx" ON "InstrumentMasterEntry"("lifecycleStatus");

-- CreateIndex
CREATE INDEX "InstrumentMasterSyncRun_startedAt_idx" ON "InstrumentMasterSyncRun"("startedAt");

-- CreateIndex
CREATE INDEX "InstrumentMasterSyncRun_status_idx" ON "InstrumentMasterSyncRun"("status");

-- CreateIndex
CREATE INDEX "Instrument_masterEntryId_idx" ON "Instrument"("masterEntryId");

-- AddForeignKey
ALTER TABLE "Instrument" ADD CONSTRAINT "Instrument_masterEntryId_fkey" FOREIGN KEY ("masterEntryId") REFERENCES "InstrumentMasterEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
