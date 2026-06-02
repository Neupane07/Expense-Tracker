-- CreateEnum
CREATE TYPE "ResearchCategory" AS ENUM ('RESULT', 'ORDER_WIN', 'CORPORATE_ACTION', 'REGULATORY', 'MANAGEMENT_COMMENTARY', 'SECTOR_NEWS', 'COMPANY_NEWS', 'USER_NOTE', 'RISK_FLAG', 'OTHER');

-- CreateEnum
CREATE TYPE "ResearchImpact" AS ENUM ('POSITIVE', 'NEGATIVE', 'NEUTRAL', 'MIXED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "ResearchItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "instrumentId" TEXT,
    "symbol" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "category" "ResearchCategory" NOT NULL,
    "impact" "ResearchImpact" NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "publishedAt" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "asOf" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confidence" DECIMAL(5,4) NOT NULL DEFAULT 0.8,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchEvidence" (
    "id" TEXT NOT NULL,
    "researchItemId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "unit" TEXT,
    "evidenceDate" TIMESTAMP(3),
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "instrumentId" TEXT,
    "symbol" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latestEvidenceAt" TIMESTAMP(3),
    "hasFreshEvidence" BOOLEAN NOT NULL DEFAULT false,
    "staleReason" TEXT,
    "positiveCount" INTEGER NOT NULL DEFAULT 0,
    "negativeCount" INTEGER NOT NULL DEFAULT 0,
    "neutralCount" INTEGER NOT NULL DEFAULT 0,
    "riskFlags" JSONB NOT NULL DEFAULT '[]',
    "summary" TEXT NOT NULL,
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResearchItem_userId_symbol_idx" ON "ResearchItem"("userId", "symbol");

-- CreateIndex
CREATE INDEX "ResearchItem_userId_symbol_category_idx" ON "ResearchItem"("userId", "symbol", "category");

-- CreateIndex
CREATE INDEX "ResearchItem_userId_symbol_impact_idx" ON "ResearchItem"("userId", "symbol", "impact");

-- CreateIndex
CREATE INDEX "ResearchItem_instrumentId_idx" ON "ResearchItem"("instrumentId");

-- CreateIndex
CREATE INDEX "ResearchEvidence_researchItemId_idx" ON "ResearchEvidence"("researchItemId");

-- CreateIndex
CREATE INDEX "ResearchSnapshot_userId_symbol_createdAt_idx" ON "ResearchSnapshot"("userId", "symbol", "createdAt");

-- CreateIndex
CREATE INDEX "ResearchSnapshot_instrumentId_idx" ON "ResearchSnapshot"("instrumentId");

-- AddForeignKey
ALTER TABLE "ResearchItem" ADD CONSTRAINT "ResearchItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchItem" ADD CONSTRAINT "ResearchItem_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchEvidence" ADD CONSTRAINT "ResearchEvidence_researchItemId_fkey" FOREIGN KEY ("researchItemId") REFERENCES "ResearchItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchSnapshot" ADD CONSTRAINT "ResearchSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchSnapshot" ADD CONSTRAINT "ResearchSnapshot_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
