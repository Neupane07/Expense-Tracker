# Migration Notes

This document tracks the migration from Expense Tracker to Finance OS.

## Goal

Evolve the existing Expense Tracker into a modular Finance OS application without breaking existing expense functionality.

## Current status

Existing app supports:

- Google session authentication
- statement upload
- parsing
- transaction normalization
- deduplication
- categorization rules
- expense dashboard

## Migration phases

### Phase 1: Foundation

Status: In progress

Tasks:

- Update `docs/ARCHITECTURE.md`
- Create `docs/EXPENSE_MODULE.md`
- Create portfolio/market/scanner/risk/MCP docs
- Add placeholder backend modules
- Add placeholder frontend routes
- Keep existing expense behavior unchanged
- Do not change Prisma schema
- Do not change deployment

### Phase 2: Portfolio snapshot and mutual funds

Status: Completed through mutual fund valuation

Tasks:

- Add portfolio tables
- Add Dhan read-only holdings sync
- Add manual MF input support
- Add AMFI NAV sync
- Include mutual fund valuation in portfolio snapshots

### Phase 3: Market data

Status: Completed

Tasks:

- Add instrument master
- Add OHLC/candle storage
- Add technical indicators
- Add data freshness labels

### Phase 4: Deterministic risk engine

Status: Completed

Tasks:

- Add deterministic trade validation
- Add risk/reward validation
- Add position sizing
- Add portfolio risk summary
- Add warnings and rejection reasons
- Keep scanner generation unimplemented

### Phase 5: MCP tools

Status: Not started

Tasks:

- Add read-only MCP server
- Expose portfolio/scanner/risk tools
- Add audit logs
- Keep order placement disabled

## Change log

### YYYY-MM-DD

- Created Finance OS documentation foundation.
- No behavior changes.

### 2026-05-29

- Added placeholder authenticated NestJS modules for Finance OS foundation:
  `apps/api/src/portfolio/*`, `apps/api/src/broker/*`,
  `apps/api/src/market-data/*`, `apps/api/src/scanner/*`,
  `apps/api/src/risk/*`, `apps/api/src/trade-journal/*`, and
  `apps/api/src/research/*`.
- Registered the placeholder modules in `apps/api/src/app.module.ts`.
- Added static frontend placeholder routes/pages in
  `apps/web/src/pages/finance-placeholder-page.tsx`.
- Added frontend routes in `apps/web/src/App.tsx` for Portfolio,
  Swing Scanner, Trade Journal, and Research.
- Added sidebar/mobile nav items and page titles in
  `apps/web/src/components/layout/app-layout.tsx`.
- Preserved current expense tracker routes and did not change
  `apps/api/prisma/schema.prisma`.
- Added the read-only portfolio snapshot foundation:
  - Prisma models and migration for broker accounts, Dhan holding/position/order/trade/fund snapshots, mutual fund holdings, mutual fund NAVs, and portfolio snapshots.
  - Dhan read-only client and sync services for holdings, positions, orders, trades, and fund limits.
  - Portfolio endpoints for `GET /portfolio/snapshot`, `POST /portfolio/sync/dhan`, `GET /portfolio/holdings`, and `GET /portfolio/orders`.
  - Raw broker API payload storage alongside normalized broker records.
  - Stock/ETF/cash allocation calculation from synced Dhan holdings and fund limits.
  - Unit tests for Dhan normalization and allocation math.
- Phase 1 initially used `DHAN_BASE_URL`, `DHAN_CLIENT_ID`, and
  `DHAN_ACCESS_TOKEN`; Phase 3 replaced that runtime design with encrypted
  in-app credential storage.
- No order placement APIs or scanner behavior were added.
- Expense module behavior was left unchanged.
- Added Phase 2 mutual fund support:
  - Manual mutual fund holding CRUD under `/portfolio/mutual-funds`.
  - AMFI NAV sync under `POST /portfolio/sync/amfi-nav`.
  - AMFI scheme matching by normalized scheme name, with manual `schemeCode` override taking precedence.
  - Mutual fund value, NAV, NAV date, P&L, and stale NAV warnings in portfolio valuation output.
  - Portfolio snapshots now include mutual fund allocation and `totalMfValue`.
  - Unit tests cover AMFI matching, valuation math, stale NAV warnings, and updated allocation math.
- AMFI sync uses `AMFI_NAV_URL`, defaulting to `https://www.amfiindia.com/spages/NAVAll.txt`.
- Scanner, MCP, and order placement remain unimplemented.

### 2026-05-30

- Added secure Dhan broker credential storage:
  - New `BrokerConnection` and `BrokerCredential` tables.
  - Dhan API key, API secret, client ID, and access token are stored encrypted at rest with AES-256-GCM.
  - The only server env needed for broker secrets is `FINANCE_OS_CREDENTIAL_KEY`.
  - Dhan client ID/access token are no longer read directly from env as the runtime design.
  - Broker connection API responses return only masked metadata and booleans, never raw secrets.
- Added read-only Dhan connection management endpoints:
  - `GET /broker/dhan/connection`
  - `POST /broker/dhan/credentials`
  - `POST /broker/dhan/validate`
  - `DELETE /broker/dhan/credentials`
- Updated existing read-only Dhan portfolio sync to use encrypted saved credentials.
- Added market-data foundation tables:
  - `Instrument`
  - `PriceSnapshot`
  - `DailyCandle`
  - `TechnicalIndicatorSnapshot`
  - `DataQualityWarning`
- Added market-data services and endpoints for instruments, latest prices, daily candles, and indicators.
- Dhan market-data reads use saved encrypted credentials and only call read-only market quote/historical candle endpoints.
- Added initial technical indicators:
  - SMA 20/50/200
  - RSI 14
  - ATR 14
  - volume average 20
  - volume ratio
  - distance from SMA 50
- Added Settings -> Broker Connections -> Dhan UI for saving, validating, and removing credentials.
- No scanner, MCP, order placement, auto trading, MTF, or F&O behavior was added.
- Added deterministic risk engine foundation:
  - `POST /risk/validate-trade` validates only user-provided BUY/DELIVERY trade setups.
  - `POST /risk/position-size` calculates quantity from cash, capital limits, risk limits, entry, and stop loss.
  - `GET /risk/portfolio` reports portfolio value, cash, active swing capital approximation, concentration, allocation, sector/theme exposure, and warnings.
  - Configurable risk defaults were added for minimum risk/reward, active swing limits, risk-per-trade, active swing capital, and no-MTF/no-F&O/no-auto-trading boundaries.
  - Risk validation rejects unknown symbols, missing/stale prices, invalid entry/target/stop-loss geometry, low risk/reward, invalid quantity, insufficient cash, non-DELIVERY products, MTF, and F&O.
  - Risk validation warns on existing holdings, concentration increases, high single-stock concentration, and fallback/unofficial data sources.
  - Unit tests cover valid trade math, rejection paths, sizing by risk/capital, stale data, existing holding warnings, non-DELIVERY products, and missing symbols.
- Scanner, MCP, order placement, auto trading, MTF, and F&O remain unimplemented.
