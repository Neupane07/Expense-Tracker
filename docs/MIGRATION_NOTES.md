# Migration Notes

This document records the repository's evolution from Expense Tracker to
Finance OS. Forward-looking work belongs in `docs/ROADMAP.md`; current facts
belong in `docs/PROJECT_STATE.md`.

## Current Position

The modular Finance OS foundations through Phase 8 hardening are merged on
`main`. Expense tracking remains operational and separated from portfolio and
trading research modules. The next work is the internal read-only tool registry
and Tool Tester, not direct MCP implementation.

## Completed History

### Original Expense Tracker

- ICICI bank and ICICI Amazon Pay card imports
- normalization, deduplication, categorization rules, review, and dashboard
- invite-only Google authentication and per-user ownership
- Docker/deployment foundation and production build fixes

### 2026-05-29: Finance OS and portfolio foundation

- created portfolio, broker, market-data, scanner, risk, journal, and research
  module boundaries and frontend navigation
- added read-only Dhan snapshot models and sync for holdings, positions, orders,
  trades, and funds
- stored normalized records and raw provider payloads
- added portfolio snapshots and allocation
- added manual mutual-fund holdings and AMFI NAV valuation

### 2026-05-30: Credentials, market data, risk, and scanner

- replaced environment-held Dhan runtime credentials with encrypted database
  storage and masked connection APIs
- added instruments, prices, candles, technical indicators, and quality warnings
- added deterministic trade validation, sizing, and portfolio risk
- added functional portfolio/market/risk UI
- added deterministic scanner, persisted runs, shared risk validation, and
  read-only scanner UI

### 2026-05-31: Trade journal

- added user-scoped DELIVERY trade plans and lifecycle
- added manual and explicit scanner-save paths
- stored validation snapshots and post-trade review data
- added Trade Journal UI

### 2026-06-02: Reconciliation and research

- reconciled same-day Dhan sells when valuing holdings
- added research items, structured evidence, and deterministic snapshots
- added manual research UI and scanner freshness/confidence integration
- left official filing and news providers as explicit unavailable stubs

### 2026-06-03: Listed-holding valuation

- added bulk live Dhan valuation, recent-price reuse, current/day P&L, and
  visible fallback warnings
- updated portfolio summaries and holdings UI

### 2026-06-04: Expense dashboard and responsive shell

- added dashboard period presets/custom ranges and redesigned charts
- added shared metric cards and responsive mobile navigation

### 2026-06-13: Phase 8 current-state hardening

- added shared backend data-quality vocabulary
- added `GET /scanner/readiness`
- added journal/broker active-trade reconciliation and stop-loss heat
- added instrument verification and corporate-action readiness policy
- added authenticated Finance OS e2e tests and focused web Vitest coverage

### 2026-07-02: Phase 12B corporate-action validation

- added `CorporateActionEvent` and `CorporateActionSyncRun` models
- Dhan provider-adjusted daily candle verification metadata on `DailyCandle`
- structured admin/CLI corporate-action event import with deduplication and corrections
- affected-range candle invalidation and indicator recalculation gates
- scanner/readiness/tool rejection for unverified adjustment or pending invalidation

## Corrections to Earlier Plans

- Research is not the next unimplemented phase; its manual evidence foundation
  is already merged.
- Scanner and Trade Journal are functional foundations, not placeholders.
- The active branch at inspection is `main`, not
  `feature/finance-os-foundation`.
- Direct MCP is no longer the recommended next phase. Internal tools and the
  Tool Tester must come first.
- The initial MCP catalog must be read-only; prior journal write-tool ideas are
  deferred.

## Remaining Migration Sequence

1. internal read-only tool registry and audit trail
2. Tool Tester UI
3. read-only MCP adapter
4. verified instrument, corporate-action ingestion, research-provider,
   market-regime, and broader scanner data

See `docs/ROADMAP.md` for scope and exit gates.

## Migration Rules

- Preserve expense behavior and ownership boundaries.
- Add Prisma migrations for schema changes; never edit production data ad hoc.
- Preserve raw import/provider evidence where permitted.
- Keep broker credentials server-side and encrypted.
- Prefer additive module contracts over moving stable expense code.
- Reuse domain services from tools/MCP; do not fork calculations.
- Do not add broker write operations, MTF/leverage, or F&O.
