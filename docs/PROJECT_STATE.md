# Finance OS Project State

## Snapshot

Repository inspection date: 2026-07-01

Phase 8 current-state hardening is complete. Phase 9 internal read-only tools
are complete on the backend. Phase 10 Tool Tester UI is implemented at
authenticated `/tools`, but the phase acceptance gate remains open until a
manual browser pass exercises all eight registry tools end to end.

## Executive Summary

Finance OS is well beyond a placeholder foundation. The repository contains a
working Expense Tracker plus implemented portfolio, read-only Dhan sync,
mutual-fund valuation, market-data, risk, scanner readiness, trade-journal, and
manual research foundations with browser pages and unit/e2e tests.

The canonical internal read-only tool registry is implemented in the API with
versioned schemas, execution audit persistence, and eight initial tools. It is
callable over authenticated `/tools` endpoints. A browser Tool Tester UI at
`/tools` calls the same registry path; manual acceptance of all eight tools is
still pending.

Phase 11 (read-only MCP adapter) should not start until Phase 10 acceptance is
recorded.
Important domain gaps also remain in instrument-master coverage, corporate-action
ingestion, automated research sources, market regime/sector breadth, and broad
scanner universe expansion.

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
- Dhan OAuth connect flow using official API key + browser login + token exchange
- 24-hour access token storage with reconnect/renew status in the UI
- server-side Dhan quote throttling and OHLC-based holdings valuation
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

### Scanner, journal, research, and internal tools

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
- canonical internal read-only tool registry with versioned Zod schemas,
  standard response envelope, secret redaction, timeout/result-size controls, and
  persisted execution audit metadata
- eight initial tools over portfolio, market-data status, scanner readiness,
  swing scan, trade validation, stock deep dive, research snapshot, and manual
  Super Order plan formatting (no broker calls)
- authenticated `/tools` catalog, schema, execute, and audit endpoints

### Tool Tester UI (Phase 10 — code)

- authenticated `/tools` route in Finance OS navigation
- tool catalog with name, version, description, and read-only badge
- schema-derived starter JSON input editor with client syntax feedback
- execution through `POST /tools/:name/execute` only (no direct domain bypass)
- structured envelope rendering: status, data, dataQuality, warnings,
  rejectReasons, asOf, durationMs, auditId, and raw JSON tab
- redacted per-user audit history from `GET /tools/audits`
- research-only and manual Super Order draft disclaimers
- Vitest coverage for catalog, JSON validation, envelope rendering, audits,
  disclaimers, and no browser-storage persistence

## Partial

### Tool Tester acceptance (Phase 10)

- Browser UI, routing, nav, tests, and build are in place (`/tools`).
- **Acceptance gate open:** an authenticated user must manually run all eight
  registered tools through `/tools` in a live web session and confirm envelope
  shape, error paths, redacted audits, and disclaimers (see `docs/API_TESTING.md`).
- Phase 10 must not be marked complete in roadmap/state docs until that pass is
  recorded.

### Internal tools (Phase 9 backend)

- Backend registry, executor, audit persistence, and eight tool handlers are
  complete and covered by unit/e2e tests.

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
- Freshness is time-based for all sources. Manual evidence within the threshold
  reports `user-provided`; older manual evidence reports `stale`.
- Official filing and news providers are explicit stubs and automated source
  types are rejected.
- There is no scheduled refresh, source deduplication policy, provider trust
  ranking, or evidence review workflow.

### Testing and operations

- Backend unit coverage is substantial for core calculations and ownership.
- Authenticated Finance OS e2e tests cover session boundaries, broker credential
  redaction, user-scoped journal access, scanner readiness, and internal tool
  catalog/audit/execute boundaries.
- Internal-tool contract, redaction, audit, and blocked-path unit tests exist.
- Focused web tests cover research-only disclaimers and warning/reject/readiness
  rendering via Vitest + Testing Library.
- No background worker/scheduler exists for broker, NAV, market, or research
  refresh. Current synchronization is request-driven.

## Missing

- Tool Tester manual acceptance pass (Phase 10 exit gate)
- read-only MCP server/adapter (Phase 11)
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
research              internal-tools
prisma                health
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
/tools
/settings/broker-connections/dhan
/admin/invitations
```

`/tools` — Tool Tester (Phase 10)

## Current Database Areas

- identity: `User`, `Invitation`, `Session`
- expenses: `Account`, `Import`, `Transaction`, `TransactionCategory`, `Rule`
- broker: account/connection/credential and holding/position/order/trade/fund snapshots
- portfolio: mutual-fund holdings/NAV and portfolio snapshots
- market data: instrument, price, daily candle, indicator, data-quality warning
- scanner: `SwingScanRun`
- journal: `TradeJournalEntry`
- research: `ResearchItem`, `ResearchEvidence`, `ResearchSnapshot`
- internal tools: `ToolExecutionAudit`

No tool-definition catalog table, corporate-action, index/sector-series, or
user-risk-settings model exists. Tool definitions live in code via the registry
service; audit rows store execution metadata only.

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
- `/tools` — catalog of registered tools
- `/tools/:name` — tool schema
- `/tools/:name/execute` — execute tool (read-only handlers)
- `/tools/audits`, `/tools/audits/:auditId` — execution audit history

Public routes are limited to health and required authentication entry/session
flow. No MCP adapter exists yet.

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
- internal-tool registry, executor envelope, redaction, audit metadata, and
  blocked/stale contract paths

Remaining high-value gaps:

- broader authenticated API e2e coverage across portfolio/market-data/research
- controller/DTO validation contracts
- Tool Tester UI Vitest coverage — in `apps/web`; manual `/tools` acceptance
  pass still required for Phase 10 closure
- deployment/security tests for MCP only after it exists

## Immediate Recommendation

Complete the Phase 10 manual acceptance checklist in `docs/API_TESTING.md`
(exercise all eight tools through `/tools` in a signed-in browser session).
Only then mark Phase 10 complete and start Phase 11 (read-only MCP adapter).

Recommended order:

```text
Tool Tester acceptance (open) -> MCP adapter -> provider/data breadth
```

## Non-Negotiable Boundaries

- research and decision support only
- manual order verification and placement
- no automated broker writes
- no MTF/leverage or F&O
- no guessed symbols, prices, evidence, or corporate-action status
- no broker secrets in frontend, logs, tool output, or MCP output
- no regression to Expense Tracker behavior
