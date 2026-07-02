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

Phase 12A maintains a global Dhan scrip-master (`api-scrip-master-detailed.csv`):

- sync via `POST /market-data/sync/instrument-master` (admin) or `pnpm instrument-master:sync`
- status via `GET /market-data/instrument-master/status`
- mapping precedence: master `securityId` (when broker hint present) → master `symbol+exchange` → broker inference only before first successful master sync
- lifecycle states: `ACTIVE`, `INACTIVE`, `DELISTED`, `RENAMED`
- ambiguous symbol matches and broker/master identifier conflicts reject without guessing

`InstrumentVerificationService` classifies mapping as `VERIFIED`, `INFERRED`,
`UNVERIFIED`, `AMBIGUOUS`, or `MISSING` and exposes readiness blockers for missing mapping.

## Corporate-Action Adjustment Policy

Phase 12B verifies historical data through two layers:

1. **Candle adjustment (available):** Dhan official daily historical API
   (`POST /charts/historical`) returns corporate-action-adjusted OHLC per Dhan
   support documentation. Stored `DailyCandle` rows from `DHAN` are marked
   `isAdjusted: true` with `dataQuality.adjustmentPolicy =
   DHAN_PROVIDER_DAILY_ADJUSTED` and `adjustmentVerifiedAt` at ingest time.
   Finance OS does not infer splits/bonuses from price gaps.

2. **Event catalog (optional/imported):** `CorporateActionEvent` rows may be
   imported via `POST /market-data/sync/corporate-actions/import` (admin) or
   `pnpm corporate-actions:import -- --file=events.json` from structured official
   exports. Automated NSE EOD Corporate Announcement sync is **unavailable**
   without a paid SFTP subscription (`NSE_EOD_CA_SUBSCRIPTION_REQUIRED`).

Deterministic validation rules:

| Condition | Result |
| --- | --- |
| No candles | `CANDLES_MISSING` — block |
| Candles not all `DHAN` + `DHAN_PROVIDER_DAILY_ADJUSTED` | `CORPORATE_ACTION_ADJUSTMENT_UNVERIFIED` — block |
| Price-affecting imported event not processed | `CORPORATE_ACTION_PENDING_INVALIDATION` — block |
| Imported catalog present and last successful sync older than 30 days | `CORPORATE_ACTION_SYNC_STALE` — block |
| Verified adjustment and no blocking event state | history-dependent paths allowed |

On import of price-affecting events (split, bonus, rights, merger, demerger,
symbol change): delete stored candles with `date < exDate` (or `effectiveDate`
when `exDate` absent) and delete indicator snapshots for the instrument; require
explicit indicator recalculation.

Status endpoints:

- `GET /market-data/corporate-actions/status`
- `POST /market-data/sync/corporate-actions` — records unavailable automated sync (admin)
- `POST /market-data/sync/corporate-actions/import` — structured import (admin)

Scanner readiness, swing scan, indicator recalculation, and internal tools block
with `HISTORICAL_ANALYSIS_BLOCKED_UNVERIFIED_ADJUSTMENT` when adjustment cannot
be verified. Dividends are stored when imported but do not invalidate OHLC
history.

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
