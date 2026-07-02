# Finance OS Architecture

## Architectural Style

Finance OS is a TypeScript modular monolith. The React app is a presentation
client; NestJS owns parsing, validation, deduplication, categorization,
portfolio calculations, market-data quality, scanner orchestration, research
rollups, and risk rules. PostgreSQL via Prisma is the source of truth.

Do not split into microservices until deployment or scaling evidence requires
it. A future MCP process may be separate for transport/security, but it must
reuse the API's internal tool contracts.

## Repository

```text
apps/
  api/                 NestJS application and domain modules
  web/                 Vite React application
docs/                  product, state, module, and operation documentation
deploy/                production Docker Compose support
```

Possible later additions:

```text
apps/
  worker/              scheduled provider sync, only when request-driven sync is insufficient
  mcp-server/          only if MCP must run as a separate process for deployment isolation
```

Phase 11 placed MCP inside `apps/api/src/mcp` because the registry and executor
are in-process NestJS providers. Extract to `apps/mcp-server` only when a
deployment or security boundary requires a separate process.

## Current Module Boundaries

```text
auth                  identity, invitations, sessions, guards
accounts              expense account ownership
imports               statement reading, parsing, normalization, persistence
transactions          transaction query and manual categorization
rules                 user categorization rules and explicit apply
dashboard             expense summaries and charts

broker                encrypted credentials and read-only provider sync
portfolio             holdings/MF valuation and snapshots
market-data           instruments, prices, candles, indicators, quality
risk                  sizing, setup validation, exposure
scanner               deterministic setup detection and orchestration
research              dated evidence and deterministic snapshots
trade-journal         manual plan and review lifecycle
```

Expense modules should remain structurally independent. Do not move them under
a new directory solely for naming consistency.

## Dependency Direction

```text
web -> authenticated HTTP controllers -> application/domain services -> Prisma

scanner -> instrument + market-data + portfolio/exposure + risk + research
trade-journal -> instrument + risk + persisted scanner result
portfolio -> broker query data + market-data valuation + mutual-fund NAV
research -> instrument mapping (optional) + research persistence
```

Rules:

- Market data does not calculate scanner scores.
- Risk does not call broker write APIs.
- Scanner does not duplicate risk math.
- Frontend does not recompute domain decisions.
- Provider clients do not leak credentials or raw secrets beyond the server.
- AI adapters call internal tools, never provider clients or Prisma directly.

## Data Ownership and Security

- Financial routes derive `userId` from the authenticated server session.
- Browser authentication uses an opaque Secure HttpOnly cookie.
- Broker credentials are encrypted with AES-256-GCM and responses expose only
  masks/status metadata.
- Broker raw payloads may be stored for reconciliation/debugging, but must not
  include application-managed secret material.
- All future tool calls and MCP calls require explicit user identity and an
  auditable authorization decision.

## Data Quality Architecture

Data quality is part of the domain response, not a UI decoration.

Relevant outputs should include:

```text
source/provider
asOf/timestamp
freshness
mapping status
warnings
reject reasons
confidence cap and reason
```

The system follows fail-closed decision rules:

- uncertain security mapping: reject
- stale/missing required price: reject
- missing required candles: reject
- unknown corporate-action adjustment when history matters: reject
- fallback/unofficial optional inputs: warn and cap confidence
- missing portfolio/research context: disclose and avoid complete-confidence claims

The current code implements much of this per module, but Phase 8 of the roadmap
should unify terminology and readiness reporting.

## Internal Tool Architecture

Phase 9 implements the internal tool layer as a NestJS `internal-tools` module:

```text
Tool Tester HTTP/UI ----+
                       |
MCP adapter (Phase 11) -+-> InternalToolsController / McpToolBridgeService
                              -> ToolRegistryService
                              -> ToolExecutorService
                              -> ToolAuditService + ToolRedactionService
                              -> existing domain services -> Prisma/providers
```

A tool definition contains:

- stable name and version
- description and research-only classification
- input and output schemas
- handler that composes existing services
- timeout and redaction policy

The registry is not a second business-logic layer. For example,
`validate_trade_setup` calls `TradeValidationService`; it does not recalculate
risk/reward itself.

## MCP Boundary

MCP is transport, not domain architecture. Phase 11 implements it as
`apps/api/src/mcp`: Streamable HTTP on `POST /mcp`, bearer auth via
`McpAccessToken`, and `McpToolBridgeService` calling the same
`ToolExecutorService` used by `/tools`. MCP must not:

- query Prisma directly
- copy scanner/risk calculations
- expose session cookies or broker credentials
- create/update journal records in initial scope
- place, modify, cancel, or trail orders

## External Providers

Current:

- Dhan read-only broker/account and market-data APIs
- Dhan individual OAuth connect flow (API key + browser login + token exchange)
- Dhan official instrument master CSV (`api-scrip-master-detailed.csv`) with sync runs and lifecycle-aware symbol mapping
- AMFI NAV text feed
- manual/user-URL research evidence

Partial or missing:

- corporate actions
- official filings
- licensed/curated news
- index, sector, global-cue, and flow data

Provider additions require explicit source, timestamp, freshness policy,
rate/failure handling, and raw-data retention rules before scanner integration.

## Persistence

Follow the repository's current Prisma setup:

- database URL remains in `prisma.config.ts`, not `schema.prisma`
- generated client output remains `../src/generated/prisma`
- import `PrismaClient` from generated code, not `@prisma/client`
- instantiate with `@prisma/adapter-pg`
- keep `ConfigModule` global

Schema changes require a migration and updates to `docs/DATA_MODEL.md` and
`docs/MIGRATION_NOTES.md`.

## Runtime Model

Current synchronization is explicit/request-driven. A worker should be added
only when scheduled freshness is required. It should invoke the same provider
and domain services, use idempotent jobs, and write freshness/failure metadata.

## Trading Boundary

Allowed outputs include portfolio state, scanner candidates, deterministic
validation, suggested quantity, and manual Dhan Super Order parameters.

The application has no normal path for broker writes. Automated order
placement, modification, cancellation, stop-loss trailing, MTF/leverage, and
F&O remain outside the architecture.
