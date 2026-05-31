-- CreateEnum
CREATE TYPE "TradeJournalEntryStatus" AS ENUM ('PLANNED', 'ACTIVE', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TradeJournalSource" AS ENUM ('MANUAL', 'FROM_SCANNER');

-- CreateTable
CREATE TABLE "TradeJournalEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL DEFAULT 'BUY',
    "product" TEXT NOT NULL DEFAULT 'DELIVERY',
    "plannedEntry" DECIMAL(14,4) NOT NULL,
    "plannedTarget" DECIMAL(14,4) NOT NULL,
    "plannedStopLoss" DECIMAL(14,4) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "setupType" TEXT,
    "status" "TradeJournalEntryStatus" NOT NULL DEFAULT 'PLANNED',
    "notes" TEXT,
    "source" "TradeJournalSource" NOT NULL DEFAULT 'MANUAL',
    "swingScanRunId" TEXT,
    "scannerCandidateKey" TEXT,
    "validationSnapshot" JSONB,
    "dataQuality" JSONB,
    "exitPrice" DECIMAL(14,4),
    "exitAt" TIMESTAMP(3),
    "actualPnl" DECIMAL(18,2),
    "exitReason" TEXT,
    "mistakeTags" TEXT[],
    "lessonLearned" TEXT,
    "closedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradeJournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TradeJournalEntry_userId_status_idx" ON "TradeJournalEntry"("userId", "status");

-- CreateIndex
CREATE INDEX "TradeJournalEntry_userId_symbol_idx" ON "TradeJournalEntry"("userId", "symbol");

-- CreateIndex
CREATE INDEX "TradeJournalEntry_userId_createdAt_idx" ON "TradeJournalEntry"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "TradeJournalEntry" ADD CONSTRAINT "TradeJournalEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
