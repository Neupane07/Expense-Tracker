# Read-Only AI and MCP Tools

## Status

Phase 9 complete: internal read-only tool registry is implemented in
`apps/api/src/internal-tools`. Tool Tester UI (Phase 10) is implemented at
`/tools` in `apps/web`; registry acceptance through that UI is pending. Phase 11
read-only MCP adapter is implemented at `POST /mcp` in `apps/api/src/mcp`.

## Required Build Order

1. harden data-quality/readiness contracts — done (Phase 8)
2. build internal read-only tool registry — done (Phase 9)
3. exercise it through the Tool Tester UI — implemented; manual acceptance pending (Phase 10)
4. expose an approved subset through MCP — done (Phase 11)

MCP must not be the first implementation of tool business logic. MCP and the
Tool Tester must call the same registry entry points as
`POST /tools/:name/execute`.

## HTTP Endpoints (Phase 9)

Authenticated session required for all routes.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/tools` | Catalog of registered tools with JSON schemas |
| GET | `/tools/:name` | Single-tool schema and metadata |
| POST | `/tools/:name/execute` | Execute tool; returns standard envelope |
| GET | `/tools/audits` | Current user's redacted audit history |
| GET | `/tools/audits/:auditId` | Single audit record (user-scoped) |

## Internal Tool Contract

Tools call existing application services and return a versioned standard
envelope. See `docs/PRODUCT_PLAN.md` for the envelope and initial catalog.

Required controls:

- authenticated user context and ownership scoping
- input/output schema validation
- deterministic errors, warnings, and rejection reasons
- source timestamps and data-quality metadata
- execution timeout and result-size limit
- secret and sensitive-payload redaction
- audit ID and persisted audit metadata

## Initial Read-Only Catalog

### Portfolio

- `get_portfolio_snapshot`

### Market and stock

- `get_market_data_status`
- `get_stock_deep_dive`
- `get_research_snapshot`

### Scanner and risk

- `get_scanner_readiness`
- `scan_swing_candidates`
- `validate_trade_setup`
- `create_manual_super_order_plan`

Deferred from initial catalog (may be added later):

- `get_portfolio_risk_report`
- `get_active_trades`
- `get_stock_technicals`
- `suggest_position_size`

The plan tool returns manual BUY/DELIVERY parameters only after validation. It
does not send anything to Dhan.

## Tool Tester

Implemented at `/tools` in `apps/web`. The tester invokes the registry exactly as MCP later will. It shows:

- tool name, version, description, and read-only status
- input JSON with client syntax validation and schema-derived starter values
- output JSON, data quality, warnings, rejects, duration, and audit ID
- redacted audit history (metadata only)

**Phase 10 is not closed** until an authenticated user completes the manual
acceptance checklist in `docs/API_TESTING.md` (all eight tools through `/tools`).

This UI is how contracts, failure modes, and redaction are accepted before an
external AI client is allowed to call them.

## MCP Adapter

Implemented as a thin transport module at `apps/api/src/mcp`.

```text
MCP client -> POST /mcp (Bearer token) -> McpToolBridgeService
  -> ToolExecutorService -> same envelope + audit as POST /tools/:name/execute
```

Architecture decision: MCP lives inside the existing NestJS API rather than a
separate `apps/mcp-server` package because it must call the in-process tool
registry and executor with no deployment boundary yet. Transport, auth, and
rate limiting stay isolated in `mcp/` so domain modules remain unchanged.

Transport: **MCP Streamable HTTP** (stateless mode, JSON response) on `POST /mcp`
using `@modelcontextprotocol/sdk` v1.29.0. Chosen because it is the current
recommended remote MCP transport and runs on the same HTTPS surface as the API.

Authentication: **revocable bearer tokens** stored hashed in `McpAccessToken`,
each mapped to exactly one `userId`. Issue tokens with:

```bash
cd apps/api && pnpm mcp:issue-token -- --userEmail you@example.com --label cursor-local
```

Set `MCP_ENABLED=true` to enable the endpoint. Browser session cookies are
rejected on `/mcp`.

Health/readiness: `GET /health/mcp`

Exposed tools (allowlist only):

- `get_portfolio_snapshot`
- `get_market_data_status`
- `get_scanner_readiness`
- `scan_swing_candidates`
- `validate_trade_setup`
- `get_stock_deep_dive`
- `get_research_snapshot`
- `create_manual_super_order_plan`

Forbidden (not registered on MCP; negative tests enforced):

- `place_order`, `modify_order`, `cancel_order`, `auto_trade`, `trail_stop_loss`
- journal-write tools, broker-write tools, generic SQL/HTTP/file tools

Controls:

- per-token rate limit (`MCP_RATE_LIMIT_PER_MINUTE`, default 60)
- executor timeout and result-size limits (inherited from Phase 9)
- secret redaction and audit metadata (inherited from Phase 9)
- cookie rejection on MCP routes

Client requirements:

- `Authorization: Bearer <mcp-token>`
- `Accept: application/json, text/event-stream`
- `Content-Type: application/json`
- do not send browser session cookies

MCP tool results return the standard envelope in `structuredContent` plus a JSON
text `content` block. Input validation is performed by the shared executor, not a
separate MCP schema path, so rejected/unavailable semantics match `/tools`.

## Forbidden Initial Tools

- `place_order`
- `modify_order`
- `cancel_order`
- `auto_trade`
- `trail_stop_loss`
- `record_trade_plan`
- `record_trade_exit`
- any generic database/query execution tool

Journal writes are excluded because initial MCP is read-only. The existing
browser UI may continue to create and update journal entries through its
authenticated application API.

## AI Behavior Contract

An AI consumer should:

- quote the tool's timestamps, sources, warnings, and rejects
- distinguish stored evidence from inference
- avoid filling missing fields from model memory
- state when data is stale or incomplete
- treat manual order parameters as a draft for user verification

An AI consumer must not claim that Finance OS placed or will place an order.
