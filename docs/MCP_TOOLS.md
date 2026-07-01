# Read-Only AI and MCP Tools

## Status

Phase 9 complete: internal read-only tool registry is implemented in
`apps/api/src/internal-tools`. Tool Tester UI (Phase 10) exercises the registry
from the browser. MCP adapter is not built yet.

## Required Build Order

1. harden data-quality/readiness contracts — done (Phase 8)
2. build internal read-only tool registry — done (Phase 9)
3. exercise it through the Tool Tester UI — done (Phase 10)
4. expose an approved subset through MCP — next (Phase 11)

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

This UI is how contracts, failure modes, and redaction are accepted before an
external AI client is allowed to call them.

## MCP Adapter

MCP should be a thin adapter:

```text
MCP request -> authenticate/authorize -> registry.execute -> MCP response
```

Deployment requirements:

- encrypted transport
- strong revocable credentials
- least-privilege tool allowlist
- rate limits and timeouts
- audit every call
- no raw browser session cookie forwarding
- no broker credential exposure

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
