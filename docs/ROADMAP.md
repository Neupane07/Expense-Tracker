# Finance OS Roadmap

## Ordering Principle

Correctness and inspectability come before breadth. Build and test one internal
read-only contract over existing services before exposing the same contract to
external AI clients.

Copy-paste implementation prompts and phase stop rules for Composer 2.5 are in
`docs/COMPOSER_2_5_PROMPTS.md`.

## Phase 8: Current-State Hardening

Status: Complete

Goal: make the existing portfolio-to-research workflow honest enough to become
an internal tool dependency.

Scope:

- define a shared data-quality vocabulary and response metadata
- add scanner readiness diagnostics for credentials, broker sync, instrument
  mapping, prices, candles, indicators, research, and portfolio context
- distinguish broker positions from journal-managed active swing trades
- calculate active-trade stop-loss exposure instead of returning a fixed zero
- document and test instrument verification and corporate-action adjustment
  policy
- add authenticated e2e coverage for Finance OS route ownership/redaction
- add focused frontend tests for critical read-only rendering and disclaimers

Exit gate:

- existing unit tests, lint, typecheck, and build pass
- stale/missing/uncertain inputs produce deterministic warnings or rejects
- no broker write endpoint exists
- expense smoke tests pass unchanged

## Phase 9: Internal Read-Only Tools

Status: Next

Goal: create the canonical AI-facing application contract without MCP.

Scope:

- tool registry with versioned names and input/output schemas
- standard response envelope and redaction
- per-user authorization and audit records
- initial tools listed in `docs/PRODUCT_PLAN.md`
- reuse existing portfolio, market-data, scanner, risk, research, and journal
  query services; no duplicated calculations
- manual Super Order plan formatter with no broker call

Exit gate:

- every tool has schema, unit tests, ownership tests, stale-data tests, and
  snapshot/contract tests
- audit records contain metadata but no credentials or raw secrets
- direct API and internal-tool results agree for shared operations

## Phase 10: Tool Tester UI

Status: Planned

Goal: prove internal tools in the browser before external exposure.

Scope:

- tool catalog and JSON input editor
- schema-derived examples and validation feedback
- structured output, warnings, rejects, quality, timing, and audit history
- explicit research-only and manual-placement labels

Exit gate:

- all initial tools can be exercised end to end by an authenticated user
- invalid input, stale data, missing credentials, and uncertain symbols are
  visibly handled
- no secret appears in browser responses, storage, or audit views

## Phase 11: Read-Only MCP Adapter

Status: Planned after Tool Tester acceptance

Goal: expose stable internal tools to approved AI assistants.

Scope:

- separate MCP transport package/app only if deployment requires it
- strong authentication, least privilege, rate limits, timeout limits, audit ID
- thin mapping to the internal registry
- read-only tools only

Exit gate:

- MCP and Tool Tester return equivalent contract results
- security review confirms no broker secrets, session cookies, or write methods
- forbidden tool names and broker write paths have negative tests

## Phase 12: Verified Data Breadth

Status: Later

Scope candidates, in this order:

- maintained Dhan/NSE/BSE instrument master and symbol lifecycle handling
- corporate-action-aware candle adjustment/validation
- licensed or official filing ingestion
- curated/official news ingestion
- sector/index data, relative strength, and market regime
- broader scanner universe with liquidity and eligibility filters
- investment-candidate research views

Each provider must have source provenance, freshness rules, failure behavior,
and a legal/reliability review before it influences confidence.

## Deferred Indefinitely

- order placement, modification, cancellation, or automatic trailing
- unattended trading
- MTF/leverage
- F&O

## Verification Per Phase

Run from repository root:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

When database models change:

```bash
cd apps/api && pnpm prisma validate
cd apps/api && pnpm prisma migrate dev
```

Manual regression checklist:

- sign in and session discovery
- import preview and confirm for both supported ICICI statement types
- transaction list, review edit, rules, and dashboard period filters
- Dhan credential save/validate/remove without secret disclosure
- read-only broker sync and portfolio valuation warnings
- mutual-fund CRUD and AMFI NAV sync
- market-data lookup and indicator recalculation
- risk validation accepted and rejected paths
- scanner run, research status, and save-to-journal action
- trade journal create, activate/close, and review
- research add/list/snapshot/delete
- confirm no order placement, modification, or cancellation route/control exists
