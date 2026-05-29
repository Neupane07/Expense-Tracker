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

Status: Planned

Tasks:

- Update `docs/ARCHITECTURE.md`
- Create `docs/EXPENSE_MODULE.md`
- Create portfolio/market/scanner/risk/MCP docs
- Add placeholder backend modules
- Add placeholder frontend routes
- Keep existing expense behavior unchanged
- Do not change Prisma schema
- Do not change deployment

### Phase 2: Portfolio snapshot

Status: Not started

Tasks:

- Add portfolio tables
- Add Dhan read-only holdings sync
- Add manual MF input support
- Add AMFI NAV sync
- Add allocation dashboard

### Phase 3: Market data

Status: Not started

Tasks:

- Add instrument master
- Add OHLC/candle storage
- Add technical indicators
- Add data freshness labels

### Phase 4: Swing scanner

Status: Not started

Tasks:

- Add deterministic filters
- Add risk/reward validation
- Add position sizing
- Add confidence scores
- Add rejection reasons

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
