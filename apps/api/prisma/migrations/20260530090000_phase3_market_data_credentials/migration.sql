-- Phase 3: encrypted broker credentials and market-data foundation.

CREATE TABLE "BrokerConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "BrokerProvider" NOT NULL,
    "brokerName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "clientIdMasked" TEXT,
    "apiKeyMasked" TEXT,
    "metadata" JSONB,
    "status" TEXT NOT NULL DEFAULT 'DISCONNECTED',
    "lastValidatedAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "accessTokenExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrokerConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BrokerCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "brokerConnectionId" TEXT NOT NULL,
    "credentialType" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "keyVersion" TEXT NOT NULL DEFAULT 'v1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrokerCredential_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Instrument" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "securityId" TEXT,
    "isin" TEXT,
    "name" TEXT NOT NULL,
    "instrumentType" TEXT NOT NULL,
    "sector" TEXT,
    "industry" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL,
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Instrument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PriceSnapshot" (
    "id" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "ltp" DECIMAL(14,4) NOT NULL,
    "open" DECIMAL(14,4),
    "high" DECIMAL(14,4),
    "low" DECIMAL(14,4),
    "previousClose" DECIMAL(14,4),
    "volume" BIGINT,
    "source" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "freshness" TEXT NOT NULL,
    "dataQuality" JSONB NOT NULL,
    "warnings" TEXT[],
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DailyCandle" (
    "id" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "open" DECIMAL(14,4) NOT NULL,
    "high" DECIMAL(14,4) NOT NULL,
    "low" DECIMAL(14,4) NOT NULL,
    "close" DECIMAL(14,4) NOT NULL,
    "volume" BIGINT,
    "source" TEXT NOT NULL,
    "isAdjusted" BOOLEAN NOT NULL DEFAULT false,
    "dataQuality" JSONB,
    "warnings" TEXT[],
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyCandle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TechnicalIndicatorSnapshot" (
    "id" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "asOfDate" TIMESTAMP(3) NOT NULL,
    "sma20" DECIMAL(14,4),
    "sma50" DECIMAL(14,4),
    "sma200" DECIMAL(14,4),
    "rsi14" DECIMAL(8,4),
    "atr14" DECIMAL(14,4),
    "volumeAverage20" DECIMAL(18,4),
    "volumeRatio" DECIMAL(10,4),
    "distanceFromSma50" DECIMAL(10,4),
    "source" TEXT NOT NULL,
    "dataQuality" JSONB NOT NULL,
    "warnings" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TechnicalIndicatorSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DataQualityWarning" (
    "id" TEXT NOT NULL,
    "instrumentId" TEXT,
    "scope" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataQualityWarning_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BrokerConnection_userId_provider_key" ON "BrokerConnection"("userId", "provider");
CREATE INDEX "BrokerConnection_userId_status_idx" ON "BrokerConnection"("userId", "status");
CREATE UNIQUE INDEX "BrokerCredential_brokerConnectionId_credentialType_key" ON "BrokerCredential"("brokerConnectionId", "credentialType");
CREATE INDEX "BrokerCredential_userId_credentialType_idx" ON "BrokerCredential"("userId", "credentialType");
CREATE UNIQUE INDEX "Instrument_symbol_exchange_key" ON "Instrument"("symbol", "exchange");
CREATE INDEX "Instrument_securityId_exchange_idx" ON "Instrument"("securityId", "exchange");
CREATE INDEX "Instrument_isin_idx" ON "Instrument"("isin");
CREATE INDEX "Instrument_symbol_idx" ON "Instrument"("symbol");
CREATE INDEX "PriceSnapshot_instrumentId_timestamp_idx" ON "PriceSnapshot"("instrumentId", "timestamp");
CREATE INDEX "PriceSnapshot_source_timestamp_idx" ON "PriceSnapshot"("source", "timestamp");
CREATE UNIQUE INDEX "DailyCandle_instrumentId_date_source_key" ON "DailyCandle"("instrumentId", "date", "source");
CREATE INDEX "DailyCandle_instrumentId_date_idx" ON "DailyCandle"("instrumentId", "date");
CREATE UNIQUE INDEX "TechnicalIndicatorSnapshot_instrumentId_asOfDate_source_key" ON "TechnicalIndicatorSnapshot"("instrumentId", "asOfDate", "source");
CREATE INDEX "TechnicalIndicatorSnapshot_instrumentId_asOfDate_idx" ON "TechnicalIndicatorSnapshot"("instrumentId", "asOfDate");
CREATE INDEX "DataQualityWarning_instrumentId_asOf_idx" ON "DataQualityWarning"("instrumentId", "asOf");
CREATE INDEX "DataQualityWarning_scope_code_idx" ON "DataQualityWarning"("scope", "code");

ALTER TABLE "BrokerConnection" ADD CONSTRAINT "BrokerConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BrokerCredential" ADD CONSTRAINT "BrokerCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BrokerCredential" ADD CONSTRAINT "BrokerCredential_brokerConnectionId_fkey" FOREIGN KEY ("brokerConnectionId") REFERENCES "BrokerConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PriceSnapshot" ADD CONSTRAINT "PriceSnapshot_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyCandle" ADD CONSTRAINT "DailyCandle_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TechnicalIndicatorSnapshot" ADD CONSTRAINT "TechnicalIndicatorSnapshot_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataQualityWarning" ADD CONSTRAINT "DataQualityWarning_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
