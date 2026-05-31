-- CreateEnum
CREATE TYPE "BrokerProvider" AS ENUM ('DHAN');

-- CreateEnum
CREATE TYPE "PortfolioAssetClass" AS ENUM ('STOCK', 'ETF', 'CASH', 'MUTUAL_FUND', 'UNKNOWN');

-- CreateTable
CREATE TABLE "BrokerAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "BrokerProvider" NOT NULL,
    "displayName" TEXT NOT NULL,
    "dhanClientId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrokerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrokerHoldingSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "brokerAccountId" TEXT NOT NULL,
    "syncRunId" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "provider" "BrokerProvider" NOT NULL DEFAULT 'DHAN',
    "exchange" TEXT,
    "tradingSymbol" TEXT NOT NULL,
    "securityId" TEXT NOT NULL,
    "isin" TEXT,
    "assetClass" "PortfolioAssetClass" NOT NULL DEFAULT 'STOCK',
    "totalQty" DECIMAL(18,6) NOT NULL,
    "dpQty" DECIMAL(18,6) NOT NULL,
    "t1Qty" DECIMAL(18,6) NOT NULL,
    "availableQty" DECIMAL(18,6) NOT NULL,
    "collateralQty" DECIMAL(18,6) NOT NULL,
    "avgCostPrice" DECIMAL(14,4) NOT NULL,
    "costValue" DECIMAL(18,2) NOT NULL,
    "marketValue" DECIMAL(18,2) NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrokerHoldingSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrokerPositionSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "brokerAccountId" TEXT NOT NULL,
    "syncRunId" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "provider" "BrokerProvider" NOT NULL DEFAULT 'DHAN',
    "dhanClientId" TEXT,
    "tradingSymbol" TEXT NOT NULL,
    "securityId" TEXT NOT NULL,
    "positionType" TEXT,
    "exchangeSegment" TEXT,
    "productType" TEXT,
    "buyAvg" DECIMAL(14,4) NOT NULL,
    "buyQty" DECIMAL(18,6) NOT NULL,
    "costPrice" DECIMAL(14,4) NOT NULL,
    "sellAvg" DECIMAL(14,4) NOT NULL,
    "sellQty" DECIMAL(18,6) NOT NULL,
    "netQty" DECIMAL(18,6) NOT NULL,
    "realizedProfit" DECIMAL(18,2) NOT NULL,
    "unrealizedProfit" DECIMAL(18,2) NOT NULL,
    "carryForwardBuyQty" DECIMAL(18,6) NOT NULL,
    "carryForwardSellQty" DECIMAL(18,6) NOT NULL,
    "dayBuyQty" DECIMAL(18,6) NOT NULL,
    "daySellQty" DECIMAL(18,6) NOT NULL,
    "dayBuyValue" DECIMAL(18,2) NOT NULL,
    "daySellValue" DECIMAL(18,2) NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrokerPositionSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrokerOrderSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "brokerAccountId" TEXT NOT NULL,
    "syncRunId" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "provider" "BrokerProvider" NOT NULL DEFAULT 'DHAN',
    "dhanClientId" TEXT,
    "orderId" TEXT NOT NULL,
    "correlationId" TEXT,
    "orderStatus" TEXT,
    "transactionType" TEXT,
    "exchangeSegment" TEXT,
    "productType" TEXT,
    "orderType" TEXT,
    "validity" TEXT,
    "tradingSymbol" TEXT,
    "securityId" TEXT,
    "quantity" DECIMAL(18,6) NOT NULL,
    "price" DECIMAL(14,4) NOT NULL,
    "triggerPrice" DECIMAL(14,4) NOT NULL,
    "remainingQuantity" DECIMAL(18,6) NOT NULL,
    "averageTradedPrice" DECIMAL(14,4) NOT NULL,
    "filledQty" DECIMAL(18,6) NOT NULL,
    "createTime" TIMESTAMP(3),
    "updateTime" TIMESTAMP(3),
    "exchangeTime" TIMESTAMP(3),
    "rawPayload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrokerOrderSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrokerTradeSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "brokerAccountId" TEXT NOT NULL,
    "syncRunId" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "provider" "BrokerProvider" NOT NULL DEFAULT 'DHAN',
    "dhanClientId" TEXT,
    "orderId" TEXT NOT NULL,
    "exchangeOrderId" TEXT,
    "exchangeTradeId" TEXT NOT NULL,
    "transactionType" TEXT,
    "exchangeSegment" TEXT,
    "productType" TEXT,
    "orderType" TEXT,
    "tradingSymbol" TEXT,
    "securityId" TEXT,
    "tradedQuantity" DECIMAL(18,6) NOT NULL,
    "tradedPrice" DECIMAL(14,4) NOT NULL,
    "createTime" TIMESTAMP(3),
    "updateTime" TIMESTAMP(3),
    "exchangeTime" TIMESTAMP(3),
    "rawPayload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrokerTradeSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrokerFundSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "brokerAccountId" TEXT NOT NULL,
    "syncRunId" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "provider" "BrokerProvider" NOT NULL DEFAULT 'DHAN',
    "dhanClientId" TEXT,
    "availableBalance" DECIMAL(18,2) NOT NULL,
    "sodLimit" DECIMAL(18,2) NOT NULL,
    "collateralAmount" DECIMAL(18,2) NOT NULL,
    "receivableAmount" DECIMAL(18,2) NOT NULL,
    "utilizedAmount" DECIMAL(18,2) NOT NULL,
    "blockedPayoutAmount" DECIMAL(18,2) NOT NULL,
    "withdrawableBalance" DECIMAL(18,2) NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrokerFundSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MutualFundHolding" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "schemeCode" TEXT,
    "schemeName" TEXT NOT NULL,
    "folioLastFour" TEXT,
    "units" DECIMAL(18,6) NOT NULL,
    "avgCostNav" DECIMAL(14,4),
    "costValue" DECIMAL(18,2),
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MutualFundHolding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MutualFundNav" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "schemeCode" TEXT NOT NULL,
    "schemeName" TEXT NOT NULL,
    "nav" DECIMAL(14,4) NOT NULL,
    "navDate" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MutualFundNav_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "brokerAccountId" TEXT,
    "snapshotTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalStockValue" DECIMAL(18,2) NOT NULL,
    "totalEtfValue" DECIMAL(18,2) NOT NULL,
    "totalCashValue" DECIMAL(18,2) NOT NULL,
    "totalValue" DECIMAL(18,2) NOT NULL,
    "allocation" JSONB NOT NULL,
    "source" JSONB NOT NULL,
    "warnings" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BrokerAccount_id_userId_key" ON "BrokerAccount"("id", "userId");
CREATE UNIQUE INDEX "BrokerAccount_userId_provider_dhanClientId_key" ON "BrokerAccount"("userId", "provider", "dhanClientId");
CREATE INDEX "BrokerAccount_userId_provider_idx" ON "BrokerAccount"("userId", "provider");
CREATE INDEX "BrokerHoldingSnapshot_userId_asOf_idx" ON "BrokerHoldingSnapshot"("userId", "asOf");
CREATE INDEX "BrokerHoldingSnapshot_userId_tradingSymbol_idx" ON "BrokerHoldingSnapshot"("userId", "tradingSymbol");
CREATE INDEX "BrokerHoldingSnapshot_brokerAccountId_asOf_idx" ON "BrokerHoldingSnapshot"("brokerAccountId", "asOf");
CREATE INDEX "BrokerHoldingSnapshot_syncRunId_idx" ON "BrokerHoldingSnapshot"("syncRunId");
CREATE INDEX "BrokerPositionSnapshot_userId_asOf_idx" ON "BrokerPositionSnapshot"("userId", "asOf");
CREATE INDEX "BrokerPositionSnapshot_userId_tradingSymbol_idx" ON "BrokerPositionSnapshot"("userId", "tradingSymbol");
CREATE INDEX "BrokerPositionSnapshot_brokerAccountId_asOf_idx" ON "BrokerPositionSnapshot"("brokerAccountId", "asOf");
CREATE INDEX "BrokerPositionSnapshot_syncRunId_idx" ON "BrokerPositionSnapshot"("syncRunId");
CREATE UNIQUE INDEX "BrokerOrderSnapshot_brokerAccountId_orderId_key" ON "BrokerOrderSnapshot"("brokerAccountId", "orderId");
CREATE INDEX "BrokerOrderSnapshot_userId_asOf_idx" ON "BrokerOrderSnapshot"("userId", "asOf");
CREATE INDEX "BrokerOrderSnapshot_userId_orderStatus_idx" ON "BrokerOrderSnapshot"("userId", "orderStatus");
CREATE INDEX "BrokerOrderSnapshot_brokerAccountId_asOf_idx" ON "BrokerOrderSnapshot"("brokerAccountId", "asOf");
CREATE INDEX "BrokerOrderSnapshot_syncRunId_idx" ON "BrokerOrderSnapshot"("syncRunId");
CREATE UNIQUE INDEX "BrokerTradeSnapshot_brokerAccountId_exchangeTradeId_key" ON "BrokerTradeSnapshot"("brokerAccountId", "exchangeTradeId");
CREATE INDEX "BrokerTradeSnapshot_userId_asOf_idx" ON "BrokerTradeSnapshot"("userId", "asOf");
CREATE INDEX "BrokerTradeSnapshot_userId_tradingSymbol_idx" ON "BrokerTradeSnapshot"("userId", "tradingSymbol");
CREATE INDEX "BrokerTradeSnapshot_brokerAccountId_asOf_idx" ON "BrokerTradeSnapshot"("brokerAccountId", "asOf");
CREATE INDEX "BrokerTradeSnapshot_syncRunId_idx" ON "BrokerTradeSnapshot"("syncRunId");
CREATE INDEX "BrokerFundSnapshot_userId_asOf_idx" ON "BrokerFundSnapshot"("userId", "asOf");
CREATE INDEX "BrokerFundSnapshot_brokerAccountId_asOf_idx" ON "BrokerFundSnapshot"("brokerAccountId", "asOf");
CREATE INDEX "BrokerFundSnapshot_syncRunId_idx" ON "BrokerFundSnapshot"("syncRunId");
CREATE INDEX "MutualFundHolding_userId_schemeCode_idx" ON "MutualFundHolding"("userId", "schemeCode");
CREATE INDEX "MutualFundHolding_userId_schemeName_idx" ON "MutualFundHolding"("userId", "schemeName");
CREATE UNIQUE INDEX "MutualFundNav_userId_schemeCode_navDate_key" ON "MutualFundNav"("userId", "schemeCode", "navDate");
CREATE INDEX "MutualFundNav_userId_navDate_idx" ON "MutualFundNav"("userId", "navDate");
CREATE INDEX "PortfolioSnapshot_userId_snapshotTime_idx" ON "PortfolioSnapshot"("userId", "snapshotTime");
CREATE INDEX "PortfolioSnapshot_brokerAccountId_snapshotTime_idx" ON "PortfolioSnapshot"("brokerAccountId", "snapshotTime");

-- AddForeignKey
ALTER TABLE "BrokerAccount" ADD CONSTRAINT "BrokerAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BrokerHoldingSnapshot" ADD CONSTRAINT "BrokerHoldingSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BrokerHoldingSnapshot" ADD CONSTRAINT "BrokerHoldingSnapshot_brokerAccountId_userId_fkey" FOREIGN KEY ("brokerAccountId", "userId") REFERENCES "BrokerAccount"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "BrokerPositionSnapshot" ADD CONSTRAINT "BrokerPositionSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BrokerPositionSnapshot" ADD CONSTRAINT "BrokerPositionSnapshot_brokerAccountId_userId_fkey" FOREIGN KEY ("brokerAccountId", "userId") REFERENCES "BrokerAccount"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "BrokerOrderSnapshot" ADD CONSTRAINT "BrokerOrderSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BrokerOrderSnapshot" ADD CONSTRAINT "BrokerOrderSnapshot_brokerAccountId_userId_fkey" FOREIGN KEY ("brokerAccountId", "userId") REFERENCES "BrokerAccount"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "BrokerTradeSnapshot" ADD CONSTRAINT "BrokerTradeSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BrokerTradeSnapshot" ADD CONSTRAINT "BrokerTradeSnapshot_brokerAccountId_userId_fkey" FOREIGN KEY ("brokerAccountId", "userId") REFERENCES "BrokerAccount"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "BrokerFundSnapshot" ADD CONSTRAINT "BrokerFundSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BrokerFundSnapshot" ADD CONSTRAINT "BrokerFundSnapshot_brokerAccountId_userId_fkey" FOREIGN KEY ("brokerAccountId", "userId") REFERENCES "BrokerAccount"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "MutualFundHolding" ADD CONSTRAINT "MutualFundHolding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MutualFundNav" ADD CONSTRAINT "MutualFundNav_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PortfolioSnapshot" ADD CONSTRAINT "PortfolioSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PortfolioSnapshot" ADD CONSTRAINT "PortfolioSnapshot_brokerAccountId_userId_fkey" FOREIGN KEY ("brokerAccountId", "userId") REFERENCES "BrokerAccount"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
