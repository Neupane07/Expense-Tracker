# Finance OS Project State

## Snapshot

Repository inspection date: 2026-06-13

Phase 8 current-state hardening is implemented on the working tree described in
this document.

## Executive Summary

Finance OS is well beyond a placeholder foundation. The repository contains a
working Expense Tracker plus implemented portfolio, read-only Dhan sync,
mutual-fund valuation, market-data, risk, scanner readiness, trade-journal, and
manual research foundations with browser pages and unit/e2e tests.

It is not yet the full target system. The largest missing architectural piece
is the internal read-only AI tool layer and tester UI. MCP should not be built
directly on controllers before that layer exists. Important domain gaps also
remain in instrument-master coverage, corporate-action ingestion, automated
research sources, market regime/sector breadth, and broad scanner universe
expansion.

## Implemented

### Expense Tracker

- invite-only Google authentication and opaque HttpOnly sessions
- per-user ownership for accounts, imports, transactions, and rules
- ICICI bank and ICICI Amazon Pay card XLS parsing
- import preview/confirm, normalization, deduplication, and import statistics
- protected categorization behavior for refunds, credits, and transfers
- review queue, manual categorization, reusable rules, and rule application
- period-filtered dashboard with summary, charts, and 12-month trend
- responsive desktop/mobile application shell

### Portfolio and broker

- encrypted Dhan credentials with masked API responses
- explicit read-only Dhan sync for holdings, positions, orders, trades, and funds
- persisted normalized snapshots plus raw broker payloads
- same-day sell reconciliation
- live listed-holding valuation with cached price snapshots and fallback warnings
- manual mutual-fund holdings and AMFI NAV valuation
- portfolio snapshot, allocation, P&L, holdings, orders, and mutual-fund UI

### Market data and risk

- instrument records resolved from known broker holdings/orders/trades
- Dhan latest-price and historical daily-candle reads
- stored prices, candles, indicators, and quality warnings
- SMA 20/50/200, RSI 14, ATR 14, volume average/ratio, SMA-50 distance
- deterministic BUY/DELIVERY validation and position sizing
- portfolio concentration, allocation, sector/industry-derived exposure warnings
- explicit rejection of stale/missing prices, bad geometry, low R:R,
  insufficient cash, non-delivery products, MTF, and F&O

### Scanner, journal, and research

- deterministic `BREAKOUT`, `PULLBACK_TO_SUPPORT`, and `RSI_REVERSAL` detectors
- scan over current synced holdings or explicit user symbols
- persisted latest scan results with warnings, rejects, confidence caps, and
  suggested manual order parameters
- every setup passes through the shared risk validation service
- manual and scanner-derived DELIVERY trade-journal plans
- journal status lifecycle, close/review fields, and server-calculated P&L
- user-entered dated research items/evidence and deterministic snapshots
- research freshness/risk flags integrated into scanner confidence
- functional `/scanner`, `/trade-journal`, and `/research` pages

## Partial

### Instrument and market-data foundation

- Instrument mapping is derived from the user's broker history. There is no
  maintained Dhan/NSE/BSE security-master ingestion, inactive-symbol lifecycle,
  or comprehensive tradable universe.
- `InstrumentVerificationService` documents mapping status and blocks
  history-dependent operations when corporate-action adjustment cannot be
  verified. No corporate-action provider exists yet.
- Instrument `sector` and `industry` fields exist but no authoritative enrichment
  pipeline is present.
- 52-week distance, relative strength, index/sector series, liquidity screens,
  FII/DII flows, global cues, and market regime are not implemented.

### Portfolio and active-trade risk

- Portfolio risk now reconciles journal `ACTIVE` entries with broker positions
  into `confirmed`, `inferred`, `unmatched`, and `incomplete` classifications.
- `maxLossIfActiveStopLossesHit` is calculated from confirmed active journal
  plans with valid stop-loss geometry; broker-only positions are not treated as
  confirmed swing trades.
- `GET /risk/portfolio` returns `activeTrades` and
  `activeTradeReconciliation` metadata in addition to existing summary fields.
- Risk defaults remain environment-configurable, not user-owned database
  settings.

### Scanner

- `GET /scanner/readiness` reports deterministic `READY`/`DEGRADED`/`BLOCKED`
  status from stored credentials, broker sync age, portfolio context, and
  per-symbol mapping/price/candle/indicator/research checks.
- Readiness supports optional `?symbols=INFY,TCS` or defaults to holdings.
- Readiness does not run scans or fetch missing provider data.
- The default scan universe remains already-owned stocks/ETFs.
- Only three setup types exist.
- Research contributes freshness caps and flags, but verified fundamental,
  official filing, news, sector, or market-regime scoring is still missing.

### Research

- Manual/user-URL evidence and deterministic snapshots are implemented.
- Official filing and news providers are explicit stubs and automated source
  types are rejected.
- There is no scheduled refresh, source deduplication policy, provider trust
  ranking, or evidence review workflow.

### Testing and operations

- Backend unit coverage is substantial for core calculations and ownership.
- Authenticated Finance OS e2e tests cover session boundaries, broker credential
  redaction, user-scoped journal access, and scanner readiness.
- Focused web tests cover research-only disclaimers and warning/reject/readiness
  rendering via Vitest + Testing Library.
- No background worker/scheduler exists for broker, NAV, market, or research
  refresh. Current synchronization is request-driven.

## Missing

- internal read-only tool registry and versioned tool contracts
- standard AI/tool response envelope
- tool execution audit model/service
- Tool Tester UI
- read-only MCP server/adapter
- stock deep-dive aggregation contract
- canonical manual Super Order plan service independent of scanner presentation
- instrument-master and corporate-action ingestion pipelines
- official/licensed filing and news ingestion
- market regime, index/sector strength, and broad scanner universe

There are no broker order placement, modification, or cancellation endpoints.
That absence is intentional and must remain.

## Current Backend Modules

```text
auth                  accounts
imports               transactions
rules                 dashboard
portfolio             broker/dhan
market-data           risk
scanner               trade-journal
research              prisma
health
```

All financial controllers use the session guard. `ConfigModule` is global and
Prisma uses the generated client plus PostgreSQL adapter configuration required
by this repository.

## Current Frontend Routes

```text
/sign-in
/dashboard
/imports
/transactions
/review
/rules
/portfolio
/scanner
/trade-journal
/research
/settings/broker-connections/dhan
/admin/invitations
```

No Tool Tester route exists.

## Current Database Areas

- identity: `User`, `Invitation`, `Session`
- expenses: `Account`, `Import`, `Transaction`, `TransactionCategory`, `Rule`
- broker: account/connection/credential and holding/position/order/trade/fund snapshots
- portfolio: mutual-fund holdings/NAV and portfolio snapshots
- market data: instrument, price, daily candle, indicator, data-quality warning
- scanner: `SwingScanRun`
- journal: `TradeJournalEntry`
- research: `ResearchItem`, `ResearchEvidence`, `ResearchSnapshot`

No tool-definition, tool-audit, corporate-action, index/sector-series, or
user-risk-settings model exists.

## Current API Surface

Implemented authenticated route groups:

- `/accounts`, `/imports`, `/transactions`, `/rules`, `/dashboard`
- `/broker/dhan/*`
- `/portfolio/*`
- `/market-data/*`
- `/risk/*`
- `/scanner/swing/*`
- `/scanner/readiness`
- `/trade-journal/entries/*`
- `/research/*`

Public routes are limited to health and required authentication entry/session
flow. No MCP or generic tool execution endpoint exists.

## Test Inventory

Backend tests cover:

- auth/session/admin boundaries and user ownership
- ICICI parsers, import validation, protected categorization, and rules
- Dhan normalization, credential encryption/redaction, and holding reconciliation
- mutual-fund matching/valuation and listed-holding valuation
- market-data quality and indicator calculations
- position sizing and trade validation
- scanner detection, risk integration, confidence caps, and no-order behavior
- trade-journal lifecycle and research evidence/snapshot behavior

Remaining high-value gaps:

- broader authenticated API e2e coverage across portfolio/market-data/research
- controller/DTO validation contracts
- tool contract tests once the internal layer exists
- deployment/security tests for MCP only after it exists

## Immediate Recommendation

Execute Phase 9 in `docs/ROADMAP.md`: build the internal read-only tool registry
and Tool Tester on top of the Phase 8 readiness and data-quality contracts.

## Non-Negotiable Boundaries

- research and decision support only
- manual order verification and placement
- no automated broker writes
- no MTF/leverage or F&O
- no guessed symbols, prices, evidence, or corporate-action status
- no broker secrets in frontend, logs, tool output, or MCP output
- no regression to Expense Tracker behavior
