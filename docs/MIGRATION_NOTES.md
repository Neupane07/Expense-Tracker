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

### Phase 5: Swing scanner foundation

Status: Completed

Tasks:

- Add deterministic swing scan pipeline and setup detectors.
- Add scanner endpoints and persisted latest scan results.
- Wire candidates through shared risk validation.
- Extend instrument resolution from holdings/orders/trades.
- Add read-only Swing Scanner UI.
- Keep order placement disabled.

### Phase 6: Trade journal foundation

Status: Completed

Tasks:

- Add `TradeJournalEntry` model and migration.
- Add trade journal CRUD and from-scanner endpoints.
- Wire risk validation snapshots at plan creation.
- Add Trade Journal UI and scanner save-to-journal action.
- Keep order placement disabled.

### Phase 7: Research evidence engine

Status: Completed

Tasks:

- Add `ResearchItem`, `ResearchEvidence`, and `ResearchSnapshot` models and migration.
- Add research services, quality checks, and manual/placeholder providers.
- Add research API endpoints (authenticated, user-scoped).
- Integrate research freshness into swing scanner output and confidence caps.
- Replace Research placeholder UI; link scanner detail to research by symbol.
- Keep order placement and MCP disabled.

### Phase 8: MCP tools

Status: Not started

Tasks:

- Add read-only MCP server
- Expose portfolio/scanner/risk/journal/research tools
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

- Added Phase 4.5 Finance OS frontend UI:
  - Replaced the Portfolio placeholder with tabbed sections for Holdings,
    Mutual Funds, Market Data, and Risk.
  - Holdings shows portfolio snapshot, cash, total value, allocation, warnings,
    data freshness, latest broker holdings, and latest read-only orders.
  - Added a read-only Dhan sync action wired to `POST /portfolio/sync/dhan`.
  - Added manual mutual fund holding add/edit/delete UI using existing
    `/portfolio/mutual-funds` APIs.
  - Added AMFI NAV sync action wired to `POST /portfolio/sync/amfi-nav`.
  - Added market-data symbol lookup wired to instrument, latest price, candle,
    latest indicator, and indicator recalculation APIs.
  - Added risk UI for trade validation, position sizing, and portfolio-level
    risk.
  - Scanner remains a placeholder and states that scanner logic is not
    implemented yet.
  - No scanner logic, MCP, order placement, auto trading, MTF/leverage, or F&O
    behavior was added.
  - Existing expense tracker routes and backend business rules were left
    unchanged.
  - Verified with `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.

- Added Phase 5 swing scanner foundation:
  - `POST /scanner/swing/run` scans a holdings-derived universe or user-provided symbol list.
  - `GET /scanner/swing/candidates` returns the latest persisted scan with data-quality metadata.
  - Setup detectors added for `BREAKOUT`, `PULLBACK_TO_SUPPORT`, and `RSI_REVERSAL`.
  - Candidates are validated through the existing trade validation service (no duplicated risk math).
  - Instrument lookup now also maps symbols from synced Dhan orders/trades when `securityId` is present.
  - `SwingScanRun` table stores latest scan output per user.
  - Read-only `/scanner` UI added with run action, results table, and candidate detail panel.
  - Scanner remains research-only; no order placement, modification, cancellation, MCP, MTF, or F&O behavior was added.
  - Existing expense tracker routes and backend business rules were left unchanged.

- Added Phase 6 trade journal foundation:
  - `TradeJournalEntry` table with plan levels, status lifecycle, exit/review fields, and validation snapshots.
  - Endpoints: `GET/POST /trade-journal/entries`, `GET/PATCH/DELETE /trade-journal/entries/:id`, and `POST /trade-journal/entries/from-scanner-candidate`.
  - Manual plans verify symbols via instruments service and store shared risk validation snapshots.
  - From-scanner creation copies candidate defaults only after explicit user action; stores `swingScanRunId` and `scannerCandidateKey` references without denormalized scanner math.
  - `/trade-journal` UI replaces the placeholder with list, plan form, close/review form, and disclaimer.
  - Scanner candidate detail adds **Save to journal**.
  - No order placement, MCP, MTF, or F&O behavior was added.
  - Existing expense tracker routes and backend business rules were left unchanged.

### 2026-06-02

- Added Phase 7 research evidence engine:
  - Prisma models `ResearchItem`, `ResearchEvidence`, `ResearchSnapshot` with category/impact enums.
  - Services for items, snapshots, ingestion, and data-quality warnings.
  - Provider stubs for official filings and news; manual/user URL provider active.
  - Endpoints: `GET/POST /research/items`, `DELETE /research/items/:id`, `GET /research/:symbol`, `POST /research/:symbol/snapshot`.
  - Swing scanner exposes research freshness, warnings, evidence count, and risk flags; applies `NO_FRESH_NEWS_OR_FILING_CHECK` and `STALE_RESEARCH_EVIDENCE` caps.
  - `/research` UI for symbol evidence management; scanner detail links to research.
  - `docs/RESEARCH_MODULE.md` added.
  - No MCP, order placement, auto trading, MTF, or F&O behavior was added.
  - Existing expense tracker routes and backend business rules were left unchanged.
