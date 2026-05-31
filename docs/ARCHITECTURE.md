# Architecture

## Product Direction

This repository is being evolved from an Expense Tracker into a broader personal finance platform called Finance OS.

Finance OS is a modular personal finance application with these major areas:

- Expenses
- Portfolio tracking
- Broker integrations
- Market data
- Swing trade research
- Long-term investment research
- Risk management
- Trade journal
- Read-only AI/MCP tools

The existing expense tracker is the first completed module. It must continue working while new modules are added.

## Repository Structure

Current app structure:

```text
apps/
  web/    React frontend
  api/    NestJS backend

docs/
deploy/
.github/workflows/
docker-compose.yml
pnpm-workspace.yaml
```

Future structure may add:

```text
apps/
  worker/       Background jobs for sync/scans
  mcp-server/   Read-only MCP tools for AI access

packages/
  shared/       Shared types/schemas/constants
```

Do not add `worker` or `mcp-server` until the API module foundations are stable.

## Architecture Style

Finance OS should start as a modular monolith, not full microservices.

Use clear backend modules inside `apps/api/src`:

```text
src/
  app.module.ts

  prisma/
  auth/

  expenses/
  portfolio/
  broker/
  market-data/
  scanner/
  risk/
  trade-journal/
  research/
```

Each module should own its controllers, services, DTOs, and tests.

Do not mix expense import logic with portfolio or market-data logic.

## Existing Completed Module

The existing expense tracker includes:

- Google-authenticated user sessions
- XLS statement imports
- Bank/card parsers
- Transaction normalization
- Deduplication
- Rule-based categorization
- Expense dashboard

Expense-specific details are documented in `docs/EXPENSE_MODULE.md`.

## Planned Backend Modules

### auth

Owns authentication, session handling, user identity, roles, and authorization guards.

Authentication rules:

- Browser receives only an opaque Secure HttpOnly session cookie.
- No application token should be stored in `localStorage`.
- All financial modules must derive `userId` from the authenticated session.
- Public routes must be minimal.

### expenses

Owns imports, parsers, transactions, categorization rules, and expense dashboard.

Existing behavior must not break during Finance OS migration.

### portfolio

Owns holdings, portfolio snapshots, mutual fund values, cash, allocation, P&L, asset-class exposure, and portfolio history.

It must not fetch market data directly. It should use market-data services for prices and instruments.

### broker

Owns broker integrations, starting with Dhan.

Responsibilities:

- Dhan holdings sync
- Dhan positions sync
- Dhan orders/trades read-only sync
- Security master/instrument mapping
- Cash/margin snapshot

V1 must be read-only. No automated order placement.

### market-data

Owns instruments, prices, candles, technical indicators, index data, sector data, and data freshness metadata.

Every price/candle response must include:

- source
- timestamp
- freshness status
- confidence level

### scanner

Owns swing trade scans and long-term investment candidate scans.

Scanner must not invent data. It can only score candidates using verified data supplied by portfolio, market-data, research, and risk.

### risk

Owns position sizing, trade validation, exposure limits, concentration checks, and risk/reward calculations.

Risk rules must be deterministic and test-covered.

### trade-journal

Owns manual trade plans, executed trades, exit reasons, mistakes, screenshots/notes, and post-trade review.

### research

Owns company filings, news summaries, result highlights, red flags, and dated evidence.

Research output must distinguish facts from inference.

## Data Quality Rules

The system must label data quality explicitly.

A scanner result must include:

- priceSource
- priceTimestamp
- technicalSource
- filingSource
- newsSource
- confidenceCapReason

If live or recent price data is unavailable, scanner confidence must be capped.

If symbol/security mapping is uncertain, trade validation must reject the setup.

If corporate action status is uncertain, trade validation must reject the setup.

## Trading Boundary

V1 is research-only.

The system must not place buy/sell orders automatically.

Allowed:

- Show portfolio snapshot
- Show active trades
- Generate swing trade candidates
- Generate suggested Dhan Super Order parameters
- Validate risk/reward
- Suggest position size

Not allowed in V1:

- Auto-buy
- Auto-sell
- Auto-modify stop loss
- Unattended trading
- MTF/leverage recommendation
- F&O recommendation

The user must manually verify and place all orders in Dhan.

## Frontend Direction

The web app should become a Finance OS shell with modules:

- Overview
- Expenses
- Portfolio
- Swing Scanner
- Watchlist
- Trade Journal
- Research
- Settings

Existing expense pages should move under the Expenses section without behavior changes.

## Migration Strategy

Migration must happen in safe steps:

- Update docs.
- Add placeholder modules only.
- Keep existing expense functionality working.
- Add portfolio snapshot.
- Add broker read-only sync.
- Add market data.
- Add scanner.
- Add risk engine.
- Add MCP read-only tools.

Every structural change must be documented in `docs/MIGRATION_NOTES.md`.
