# Market Data Module

## Purpose

The Market Data module provides verified market data for portfolio valuation, swing scanning, investment research, and risk validation.

This module must prioritize correctness, freshness, symbol mapping, and data quality labels.

## Scope

V1 responsibilities:

- Maintain instrument master
- Store/security-map NSE/BSE symbols
- Fetch or ingest latest prices
- Fetch or ingest daily OHLC candles
- Calculate technical indicators
- Track index/sector performance
- Track market regime inputs
- Provide data freshness metadata

Out of scope for V1:

- Tick-level trading system
- HFT/low-latency infrastructure
- Auto-order execution
- Derivatives strategy engine

## Planned Backend Structure

```text
src/market-data/
  market-data.module.ts
  instruments.service.ts
  prices.service.ts
  candles.service.ts
  indicators.service.ts
  sector-index.service.ts
  market-regime.service.ts
```

## Instrument Mapping

Every traded security must have a verified instrument record.

Fields should eventually include:

- id
- symbol
- exchange
- securityId
- isin
- name
- instrumentType
- sector
- industry
- isActive
- lastVerifiedAt
- source

If symbol/security mapping is uncertain, trade validation must reject the setup.

`InstrumentVerificationService` classifies mapping as `VERIFIED`, `INFERRED`,
`UNVERIFIED`, or `MISSING` and exposes readiness blockers for missing mapping.

## Corporate-Action Adjustment Policy

There is no corporate-action ingestion provider in Finance OS today. Stored daily
candles may include `isAdjusted`, but that flag is not independently verified.

Policy:

- if adjustment cannot be verified, block history-dependent operations such as
  scanner readiness technical checks and indicator-dependent validation
- emit `CORPORATE_ACTION_ADJUSTMENT_UNVERIFIED`
- do not claim a corporate-action provider exists

Every latest price must include:

- symbol
- exchange
- ltp
- open
- high
- low
- previousClose
- volume
- source
- timestamp
- isLive
- isFallback

If price is fallback/unofficial, scanner confidence must be capped.

## Candle Data

Daily candles should include:

- symbol
- exchange
- date
- open
- high
- low
- close
- volume
- source
- isAdjusted

Corporate actions must be considered before trusting historical indicators.

## Technical Indicators

Initial indicators:

- SMA 20
- SMA 50
- SMA 200
- RSI 14
- ATR 14
- volume average 20
- volume ratio
- distance from SMA 50
- distance from 52-week high/low
- relative strength vs Nifty/Sector

Do not calculate scanner scores inside this module.

This module only provides indicator data.

## Market Regime

Market regime should summarize:

- Nifty trend
- Bank Nifty trend
- Midcap/smallcap trend
- India VIX
- crude oil
- USD/INR
- US market cue
- Asian market cue
- FII/DII flows
- sector strength

Output should be one of:

- RISK_ON
- NEUTRAL
- CAUTIOUS
- RISK_OFF

Each output must include reasons and timestamps.

## Data Freshness Rules

Scanner confidence must be capped if:

- latest price is older than allowed threshold
- candles are missing
- volume data is missing
- corporate action status is unknown
- symbol mapping is uncertain
- source is fallback/unofficial

Suggested caps:

- Live price missing: max confidence 5.5
- OHLC missing: reject
- Volume missing: max confidence 6.0
- Corporate action unknown: reject
- Fallback price source: max confidence 6.0

## API Direction

Phase 3 endpoints:

- `GET /market-data/instruments/:symbol`
- `GET /market-data/prices/:symbol/latest`
- `GET /market-data/candles/:symbol`
- `GET /market-data/indicators/:symbol/latest`
- `POST /market-data/indicators/recalculate/:symbol`

All endpoints require authenticated session unless explicitly made internal-only.

Every response must include:

- `source`
- `asOf` or `timestamp`
- `dataQuality`
- `warnings`

Phase 3 Dhan integration uses encrypted credentials from broker connection
storage. It must not read `DHAN_CLIENT_ID` or `DHAN_ACCESS_TOKEN` directly from
environment variables.
