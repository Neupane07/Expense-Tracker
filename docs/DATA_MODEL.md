# Finance OS Data Model

`apps/api/prisma/schema.prisma` is the source of truth. This document explains
the current model groups and planned additions; it does not replace the schema.

## Identity and Access

- `User`: verified Google identity and role
- `Invitation`: one-time admission record
- `Session`: hash of the opaque browser session token

All user financial records are scoped by `userId`. Broker and financial APIs
must derive that ID from the authenticated session.

## Expenses

- `Account`: bank account or credit card
- `Import`: uploaded statement metadata, hash, status, and row counts
- `Transaction`: normalized money-in/money-out row
- `TransactionCategory`: vendor/category/type result and manual flag
- `Rule`: user-owned deterministic categorization rule

Deduplication uses the user/account context plus normalized date, description,
amounts, and reference number where available. Credit-card bill payment remains
`TRANSFER`; card purchases are the expenses.

## Broker and Portfolio

- `BrokerAccount`: provider account identity used by persisted snapshots
- `BrokerConnection`: masked connection status and metadata
- `BrokerCredential`: AES-256-GCM encrypted credential material
- `BrokerHoldingSnapshot`
- `BrokerPositionSnapshot`
- `BrokerOrderSnapshot`
- `BrokerTradeSnapshot`
- `BrokerFundSnapshot`
- `MutualFundHolding`
- `MutualFundNav`
- `PortfolioSnapshot`

Broker snapshot rows retain normalized fields and `rawPayload` for
reconciliation. They are read-only observations, not order-management records.

## Market Data

- `Instrument`: symbol/exchange/security mapping and optional sector/industry
- `PriceSnapshot`: timestamped quote and quality metadata
- `DailyCandle`: sourced OHLCV row with adjustment flag
- `TechnicalIndicatorSnapshot`: deterministic indicator rollup
- `DataQualityWarning`: persisted warning metadata

Current `Instrument` rows are populated from known broker records. The model is
not yet backed by a comprehensive security-master lifecycle.

## Scanner and Journal

- `SwingScanRun`: per-user persisted universe and JSON candidate result
- `TradeJournalEntry`: user-authored DELIVERY plan, lifecycle, validation
  snapshot, and post-trade review

Scanner candidates are stored as JSON snapshots rather than normalized trade
orders. A journal entry is not proof that an order was placed or executed.

## Research

- `ResearchItem`: dated user-owned evidence record with source metadata
- `ResearchEvidence`: structured facts attached to an item
- `ResearchSnapshot`: deterministic per-symbol rollup, counts, flags, and warnings

Current research persistence supports manual/user-URL evidence. It must not
represent unavailable automated news or filing ingestion as complete.

## Known Missing Models

These concepts are not present in the current schema:

- user-owned risk settings
- corporate actions and candle-adjustment verification records
- index/sector time series and market-regime snapshots
- instrument-master import/sync runs
- internal tool definitions/versions and execution audit records
- MCP credentials/allowlists, if a separate deployment later requires them

Active-trade reconciliation is computed at read time from `TradeJournalEntry`
and broker position snapshots; there is no separate active-trade table yet.

Add models only in the phase that owns their behavior. Tool definitions may be
code-defined, but execution audits should be persisted with user, tool name,
version, timing, status, redacted input/output metadata, and timestamps.

## Prisma Rules

- Keep database URL configuration in `prisma.config.ts`.
- Keep generated client output at `../src/generated/prisma`.
- Import the client from generated code, not `@prisma/client`.
- Use `@prisma/adapter-pg` when constructing the client.
- Every schema change requires a migration and ownership/index review.
