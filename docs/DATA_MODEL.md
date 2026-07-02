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

- `Instrument`: symbol/exchange/security mapping, optional sector/industry, optional link to master entry
- `InstrumentMasterEntry`: global Dhan scrip-master row with lifecycle status and raw source metadata
- `InstrumentMasterSyncRun`: idempotent import/sync run status, counts, and provider metadata
- `PriceSnapshot`: timestamped quote and quality metadata
- `DailyCandle`: sourced OHLCV row with adjustment flag
- `TechnicalIndicatorSnapshot`: deterministic indicator rollup
- `DataQualityWarning`: persisted warning metadata

Current `Instrument` rows are resolved through the maintained Dhan scrip master when synced; broker snapshots remain a secondary hint only when the master has never synced. Lifecycle states (`ACTIVE`, `INACTIVE`, `DELISTED`, `RENAMED`) and ambiguous symbol matches fail closed in scanner/risk paths.

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
- MCP credentials/allowlists, if a separate deployment later requires them

Phase 11 stores MCP bearer credentials in `McpAccessToken` (hashed, per-user).
Tool allowlisting remains code-defined in `apps/api/src/mcp/mcp.constants.ts`.

## Internal Tools and Audit (Phase 9)

Tool definitions are code-defined in `apps/api/src/internal-tools`. Execution
audits are persisted:

- `ToolExecutionAudit`: user-scoped metadata for each tool run
  (`userId`, `toolName`, `toolVersion`, `status`, `startedAt`, `completedAt`,
  `durationMs`, `inputHash`, redacted `inputMeta`, warning/reject counts,
  `errorCode`)
- Enum `ToolExecutionStatus`: `OK`, `REJECTED`, `UNAVAILABLE`, `ERROR`

## MCP Access (Phase 11)

- `McpAccessToken`: hashed revocable bearer credential mapped to one `userId`
  (`tokenHash`, `tokenPrefix`, optional `label`, `revokedAt`, `expiresAt`,
  `lastUsedAt`)

MCP tokens must not store plaintext secrets. Plaintext is shown once at issuance
via `pnpm mcp:issue-token`.

Retention: prune `ToolExecutionAudit` rows older than 90 days via a scheduled
job (not yet implemented). Indexes support per-user history and tool-name
filtering. Audits must not store credentials, session cookies, access tokens,
or unredacted sensitive payloads.

Previously missing (now implemented):

- internal tool execution audit records

Active-trade reconciliation is computed at read time from `TradeJournalEntry`
and broker position snapshots; there is no separate active-trade table yet.

Add models only in the phase that owns their behavior. Tool definitions remain
code-defined; execution audits are persisted with user, tool name, version,
timing, status, redacted input metadata, and timestamps.

## Prisma Rules

- Keep database URL configuration in `prisma.config.ts`.
- Keep generated client output at `../src/generated/prisma`.
- Import the client from generated code, not `@prisma/client`.
- Use `@prisma/adapter-pg` when constructing the client.
- Every schema change requires a migration and ownership/index review.
