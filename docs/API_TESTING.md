# API Testing

## Auth

1. Login through browser.
2. Copy session cookie.
3. Use cookie in Postman/curl.

## Portfolio tests

- POST /portfolio/sync/dhan — returns `{ sync, snapshot, holdings }` so the UI can
  reuse freshly valued holdings without an immediate duplicate quote fetch.
- GET /portfolio/snapshot — returns the latest persisted snapshot without forcing
  a new live quote fetch on every page load.
- GET /portfolio/holdings — response is now `{ holdings, summary, priceAsOf, warnings }`.
  Each holding includes `ltp`, `previousClose`, `investedValue`, `currentValue`,
  `pnl`, `pnlPercent`, `dayPnl`, `dayPnlPercent`, and `priceFreshness`
  (`LIVE` | `RECENT` | `STALE` | `MISSING` | `FALLBACK`).
- GET /portfolio/orders

## Mutual fund tests

- POST /portfolio/mutual-funds
- GET /portfolio/mutual-funds — response now includes `totalInvested`,
  `totalPnl`, and `totalPnlPercent`. Each holding includes a `pnlPercent`.
- PATCH /portfolio/mutual-funds/:holdingId
- DELETE /portfolio/mutual-funds/:holdingId
- POST /portfolio/sync/amfi-nav
- GET /portfolio/snapshot

## Broker connection tests

Set the API encryption key and Dhan callback URL before starting the server:

```bash
export FINANCE_OS_CREDENTIAL_KEY="replace-with-at-least-32-random-bytes"
export DHAN_CONNECT_CALLBACK_URL="http://localhost:4000/broker/dhan/connect/callback"
pnpm dev:api
```

In Dhan Web, create an individual API key with redirect URL exactly matching
`DHAN_CONNECT_CALLBACK_URL`.

Check the current Dhan connection. The response must contain only masked fields,
booleans, and reconnect metadata:

```bash
curl -i \
  -H "Cookie: finance_os_session=<session-cookie>" \
  http://localhost:4000/broker/dhan/connection
```

Start the supported OAuth connect flow:

```bash
curl -i \
  -X POST http://localhost:4000/broker/dhan/connect/start \
  -H "Cookie: finance_os_session=<session-cookie>" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "1000000001",
    "apiKey": "dhan-api-key",
    "apiSecret": "dhan-api-secret"
  }'
```

Open the returned `loginUrl` in a browser. After Dhan login, the callback stores
the encrypted 24-hour access token and redirects to
`/settings/broker-connections/dhan?connected=1`.

Renew an active token (Dhan official `RenewToken`; fails once expired):

```bash
curl -i \
  -X POST http://localhost:4000/broker/dhan/connect/renew \
  -H "Cookie: finance_os_session=<session-cookie>"
```

Legacy manual credential save remains available for migration only:

```bash
curl -i \
  -X POST http://localhost:4000/broker/dhan/credentials \
  -H "Cookie: finance_os_session=<session-cookie>" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "1000000001",
    "apiKey": "dhan-api-key",
    "apiSecret": "dhan-api-secret",
    "accessToken": "dhan-access-token",
    "accessTokenExpiresAt": "2026-06-01T18:29:59.000Z"
  }'
```

Validate the read-only Dhan connection:

```bash
curl -i \
  -X POST http://localhost:4000/broker/dhan/validate \
  -H "Cookie: finance_os_session=<session-cookie>"
```

Delete saved credentials:

```bash
curl -i \
  -X DELETE http://localhost:4000/broker/dhan/credentials \
  -H "Cookie: finance_os_session=<session-cookie>"
```

## Market data tests

These endpoints require an authenticated session and a saved Dhan connection
when live Dhan data must be fetched. Symbols are resolved from the instrument
table or latest Dhan broker holdings.

```bash
curl -i \
  -H "Cookie: finance_os_session=<session-cookie>" \
  http://localhost:4000/market-data/instruments/INFY
```

```bash
curl -i \
  -H "Cookie: finance_os_session=<session-cookie>" \
  http://localhost:4000/market-data/prices/INFY/latest
```

```bash
curl -i \
  -H "Cookie: finance_os_session=<session-cookie>" \
  "http://localhost:4000/market-data/candles/INFY?from=2025-06-01&to=2026-05-30"
```

```bash
curl -i \
  -X POST http://localhost:4000/market-data/indicators/recalculate/INFY \
  -H "Cookie: finance_os_session=<session-cookie>"
```

```bash
curl -i \
  -H "Cookie: finance_os_session=<session-cookie>" \
  http://localhost:4000/market-data/indicators/INFY/latest
```

## Expected checks

- no secrets exposed
- warnings present
- values calculated correctly
- expense module still works
- market-data responses include source, asOf/timestamp, dataQuality, and warnings
- scanner endpoints are read-only research tools and do not place orders
- MCP adapter is read-only; order placement endpoints do not exist
- portfolio UI loads snapshot, holdings, orders, and data-quality warnings
- Dhan sync button calls `POST /portfolio/sync/dhan`
- mutual fund UI calls existing create, update, delete, and AMFI sync APIs
- market-data lookup renders latest price, source, freshness, warnings, and indicators
- risk validation UI renders both valid and rejected backend responses

## Risk tests

Validate a user-provided BUY/DELIVERY trade setup. This endpoint does not scan,
recommend, or place orders:

```bash
curl -i \
  -X POST http://localhost:4000/risk/validate-trade \
  -H "Cookie: finance_os_session=<session-cookie>" \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "INFY",
    "side": "BUY",
    "entry": 1500,
    "target": 1620,
    "stopLoss": 1450,
    "quantity": 5,
    "product": "DELIVERY"
  }'
```

Calculate position size from available cash, capital cap, risk cap, entry, and
stop loss:

```bash
curl -i \
  -X POST http://localhost:4000/risk/position-size \
  -H "Cookie: finance_os_session=<session-cookie>" \
  -H "Content-Type: application/json" \
  -d '{
    "availableCash": 100000,
    "maxCapitalPerTrade": 20000,
    "maxRiskPerTrade": 500,
    "entry": 1500,
    "stopLoss": 1450
  }'
```

Review portfolio-level risk:

```bash
curl -i \
  -H "Cookie: finance_os_session=<session-cookie>" \
  http://localhost:4000/risk/portfolio
```

Portfolio risk checks should show:

- `activeTrades` with `confirmed`, `inferred`, `unmatched`, or `incomplete`
  classifications
- `activeTradeReconciliation` with inferred broker positions and unmatched journal
  entries
- `maxLossIfActiveStopLossesHit` calculated only from confirmed active journal
  plans with valid stop-loss geometry
- broker-only positions surfaced as warnings, not counted as confirmed swings

Risk checks should show:

- deterministic `warnings` and `rejectReasons`
- `PRICE_STALE` or `PRICE_MISSING` rejection when market data is not current
- `PRODUCT_NOT_DELIVERY` rejection for intraday/margin products
- no scanner output
- no order placement, modification, or cancellation
- no broker secrets in any response

## UI smoke tests

With the API and web app running, verify:

- `/dashboard`, `/imports`, `/transactions`, `/review`, and `/rules` still load.
- `/settings/broker-connections/dhan` still saves, validates, and removes
  credentials without displaying secrets after save.
- `/portfolio` loads the Holdings tab and shows empty/loading/error states when
  synced data is unavailable.
- Portfolio Holdings Dhan sync uses `POST /portfolio/sync/dhan`.
- Mutual Funds add/edit/delete and AMFI NAV sync use only existing portfolio APIs.
- Market Data lookup calls the instrument, latest price, candle, and indicator
  endpoints, then renders source, timestamp, freshness, warnings, and indicator
  values when present.
- Risk validation and position sizing render backend results without generating
  scanner candidates or placing orders.
- `/scanner` loads `GET /scanner/readiness`, runs `POST /scanner/swing/run`, loads `GET /scanner/swing/candidates`, shows research-only disclaimer text, and can save a candidate to the journal.
- `/trade-journal` lists entries, creates manual plans, closes trades with review fields, and shows the manual-execution disclaimer.
- `/research` loads symbol evidence, shows snapshot/warnings/data quality, adds manual items, and regenerates snapshots.
- `/tools` loads the tool catalog, selects a registered tool, edits JSON input, runs `POST /tools/:name/execute`, renders the standard envelope (status, data, dataQuality, warnings, rejectReasons, asOf, durationMs, auditId), shows raw JSON, lists redacted audit history, and displays research-only plus manual-draft disclaimers. Tool input and results must not appear in browser storage.
- `/scanner` candidate detail shows research status and links to `/research?symbol=...`.

## Scanner tests

Check scanner readiness before running a scan:

```bash
curl -i \
  -H "Cookie: finance_os_session=<session-cookie>" \
  http://localhost:4000/scanner/readiness
```

Check readiness for explicit symbols:

```bash
curl -i \
  -H "Cookie: finance_os_session=<session-cookie>" \
  "http://localhost:4000/scanner/readiness?symbols=INFY,TCS"
```

Readiness checks should show:

- overall `status` of `READY`, `DEGRADED`, or `BLOCKED`
- per-check `warnings` and `blockers`
- `researchDisclaimer` stating readiness does not run scans
- no provider fetch side effects when stored data is missing
- `CORPORATE_ACTION_ADJUSTMENT_UNVERIFIED` when candle adjustment cannot be
  verified

Run a swing scan on synced holdings (default universe):

```bash
curl -i \
  -X POST http://localhost:4000/scanner/swing/run \
  -H "Cookie: finance_os_session=<session-cookie>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Run a swing scan on explicit symbols:

```bash
curl -i \
  -X POST http://localhost:4000/scanner/swing/run \
  -H "Cookie: finance_os_session=<session-cookie>" \
  -H "Content-Type: application/json" \
  -d '{"symbols":["INFY","TCS"],"universe":"symbols"}'
```

Fetch the latest scan results:

```bash
curl -i \
  -H "Cookie: finance_os_session=<session-cookie>" \
  http://localhost:4000/scanner/swing/candidates
```

Scanner checks should show:

- `researchDisclaimer` on every response
- candidate `rejectReasons`, `warnings`, `dataQuality`, and `confidenceCapReason` when applicable
- `status` of `candidate`, `watchlist`, or `rejected`
- shared risk validation rejections such as `PRICE_STALE`, `RISK_REWARD_BELOW_MINIMUM`, and `SYMBOL_NOT_VERIFIED`
- no order placement, modification, or cancellation endpoints
- no broker secrets in any response

## Research tests

List research items (optional filters):

```bash
curl -i \
  -H "Cookie: finance_os_session=<session-cookie>" \
  "http://localhost:4000/research/items?symbol=INFY"
```

Add manual research evidence:

```bash
curl -i \
  -X POST http://localhost:4000/research/items \
  -H "Cookie: finance_os_session=<session-cookie>" \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "INFY",
    "title": "Q4 results beat estimates",
    "summary": "Revenue grew 12% YoY per stored filing note.",
    "category": "RESULT",
    "impact": "POSITIVE",
    "sourceType": "USER_URL",
    "sourceName": "User",
    "sourceUrl": "https://example.com/results",
    "publishedAt": "2026-05-28T00:00:00.000Z"
  }'
```

Get symbol research bundle (snapshot, items, warnings, data quality):

```bash
curl -i \
  -H "Cookie: finance_os_session=<session-cookie>" \
  http://localhost:4000/research/INFY
```

Regenerate deterministic snapshot:

```bash
curl -i \
  -X POST http://localhost:4000/research/INFY/snapshot \
  -H "Cookie: finance_os_session=<session-cookie>"
```

Delete a user-owned research item:

```bash
curl -i \
  -X DELETE http://localhost:4000/research/items/<item-id> \
  -H "Cookie: finance_os_session=<session-cookie>"
```

Research checks should show:

- `dataQuality.status` of `fresh`, `stale`, `missing`, `user-provided`, or `official`
- `RESEARCH_EVIDENCE_MISSING` when no items exist
- `STALE_RESEARCH_EVIDENCE` when evidence is older than threshold
- scanner candidates with `researchFreshness`, `researchWarnings`, and confidence caps when research is missing/stale
- summaries derived only from stored item text (no AI-generated facts)
- no order placement, MCP, or broker secrets in responses

## Internal read-only tool tests (Phase 9)

List the tool catalog:

```bash
curl -i \
  -H "Cookie: finance_os_session=<session-cookie>" \
  http://localhost:4000/tools
```

Inspect a single tool schema:

```bash
curl -i \
  -H "Cookie: finance_os_session=<session-cookie>" \
  http://localhost:4000/tools/validate_trade_setup
```

Execute scanner readiness through the tool envelope:

```bash
curl -i \
  -X POST http://localhost:4000/tools/get_scanner_readiness/execute \
  -H "Cookie: finance_os_session=<session-cookie>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Execute trade validation (rejected path example):

```bash
curl -i \
  -X POST http://localhost:4000/tools/validate_trade_setup/execute \
  -H "Cookie: finance_os_session=<session-cookie>" \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "INFY",
    "side": "BUY",
    "entry": 100,
    "target": 105,
    "stopLoss": 99,
    "product": "DELIVERY"
  }'
```

Manual Super Order plan (formats parameters only; no broker call):

```bash
curl -i \
  -X POST http://localhost:4000/tools/create_manual_super_order_plan/execute \
  -H "Cookie: finance_os_session=<session-cookie>" \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "INFY",
    "side": "BUY",
    "entry": 1500,
    "target": 1600,
    "stopLoss": 1450,
    "quantity": 5,
    "product": "DELIVERY"
  }'
```

List redacted audit history:

```bash
curl -i \
  -H "Cookie: finance_os_session=<session-cookie>" \
  http://localhost:4000/tools/audits
```

Tool checks should show:

- envelope fields: `tool`, `version`, `asOf`, `status`, `data`, `dataQuality`,
  `warnings`, `rejectReasons`, `auditId`, `durationMs`
- `status` of `ok`, `rejected`, `unavailable`, or `error`
- no `apiKey`, `apiSecret`, `accessToken`, or session cookie values in responses
  or audit listings
- `POST /tools/place_order/execute` returns 404 (forbidden tool name)
- audit records contain metadata only (no full financial output payload)
- `validate_trade_setup` and `POST /risk/validate-trade` agree for the same input

## MCP read-only adapter tests (Phase 11)

Prerequisites:

```bash
docker compose up -d
# set MCP_ENABLED=true in apps/api/.env
cd apps/api && pnpm prisma migrate dev
pnpm dev:api
```

Issue a bearer token for a signed-in user:

```bash
cd apps/api && pnpm mcp:issue-token -- --userEmail you@example.com --label local-mcp
```

Store the returned `token` securely. Check readiness:

```bash
curl -s http://localhost:4000/health/mcp | jq
```

Initialize MCP (Streamable HTTP):

```bash
curl -s -X POST http://localhost:4000/mcp \
  -H "Authorization: Bearer <mcp-token>" \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-03-26",
      "capabilities": {},
      "clientInfo": { "name": "manual-test", "version": "1.0.0" }
    }
  }' | jq
```

List exposed tools:

```bash
curl -s -X POST http://localhost:4000/mcp \
  -H "Authorization: Bearer <mcp-token>" \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | jq
```

Call scanner readiness:

```bash
curl -s -X POST http://localhost:4000/mcp \
  -H "Authorization: Bearer <mcp-token>" \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "get_scanner_readiness",
      "arguments": {}
    }
  }' | jq
```

MCP checks should show:

- exactly eight allowlisted tools on `tools/list`
- `structuredContent` matches the `/tools/:name/execute` envelope for the same user/input
- `auditId` present on successful tool calls
- no `apiKey`, `apiSecret`, `accessToken`, or session cookie values in responses
- `401` without bearer token; `400` when a browser session cookie is sent
- `429` after exceeding `MCP_RATE_LIMIT_PER_MINUTE`
- `503` when `MCP_ENABLED=false`
- `place_order` is not listed and cannot be invoked

Negative auth check:

```bash
curl -i -X POST http://localhost:4000/mcp \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
```

## Tool Tester UI acceptance (Phase 10 exit gate)

Record this checklist in the PR or session notes before marking Phase 10 complete
in `docs/ROADMAP.md` and `docs/PROJECT_STATE.md`.

Prerequisites: `docker compose up -d`, `pnpm dev:api`, `pnpm dev:web`, signed-in
session.

1. Open `/tools` from Finance OS navigation while authenticated.
2. Confirm catalog lists all eight tools with version, description, and read-only badge.
3. Run each tool through the UI (not direct domain APIs):
   - `get_portfolio_snapshot` — `{}`
   - `get_market_data_status` — `{}` or `{"symbols":["INFY"]}`
   - `get_scanner_readiness` — `{}`
   - `scan_swing_candidates` — `{}`
   - `validate_trade_setup` — starter trade JSON (expect ok or rejected envelope)
   - `get_stock_deep_dive` — `{"symbol":"INFY"}`
   - `get_research_snapshot` — `{"symbol":"INFY"}`
   - `create_manual_super_order_plan` — starter trade JSON; confirm **Manual draft only** banner
4. For at least one run, verify structured panel shows status, data, dataQuality,
   warnings, rejectReasons (if any), asOf, durationMs, auditId, and raw JSON tab.
5. Trigger invalid JSON in the editor — Run disabled with syntax error shown.
6. Trigger server validation error (e.g. incomplete `validate_trade_setup` input) —
   rejected envelope with `INVALID_INPUT` and issue list.
7. Confirm audit history updates with redacted metadata only (no secrets).
8. Confirm DevTools Application tab shows no tool input/output in localStorage or
   sessionStorage after runs.
9. Spot-check `/dashboard`, `/portfolio`, `/scanner`, `/trade-journal`, `/research`
   still load.

Optional cross-check: same tool + input via `curl POST /tools/:name/execute` should
return the same envelope shape as the UI run.

## Trade journal tests

List journal entries:

```bash
curl -i \
  -H "Cookie: finance_os_session=<session-cookie>" \
  "http://localhost:4000/trade-journal/entries?status=PLANNED"
```

Create a manual DELIVERY plan:

```bash
curl -i \
  -X POST http://localhost:4000/trade-journal/entries \
  -H "Cookie: finance_os_session=<session-cookie>" \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "INFY",
    "side": "BUY",
    "product": "DELIVERY",
    "plannedEntry": 1500,
    "plannedTarget": 1620,
    "plannedStopLoss": 1450,
    "quantity": 5,
    "setupType": "BREAKOUT",
    "notes": "Manual swing plan"
  }'
```

Save a plan from the latest scanner candidate (explicit user action):

```bash
curl -i \
  -X POST http://localhost:4000/trade-journal/entries/from-scanner-candidate \
  -H "Cookie: finance_os_session=<session-cookie>" \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "INFY",
    "setupType": "BREAKOUT"
  }'
```

Close a trade with exit review fields:

```bash
curl -i \
  -X PATCH http://localhost:4000/trade-journal/entries/<entry-id> \
  -H "Cookie: finance_os_session=<session-cookie>" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "CLOSED",
    "exitPrice": 1580,
    "exitReason": "Target nearly reached",
    "mistakeTags": ["EARLY_EXIT"],
    "lessonLearned": "Stick to the original target plan"
  }'
```

Trade journal checks should show:

- `disclaimer` stating the journal does not place orders
- `validationSnapshot` with `warnings` and `rejectReasons` at creation
- `PRODUCT_NOT_DELIVERY` rejection for non-DELIVERY products
- `SYMBOL_NOT_VERIFIED` rejection for unmapped symbols
- close rejected without `exitPrice`
- delete allowed only for `PLANNED` or `CANCELLED` entries
- no order placement, modification, or cancellation endpoints
- no broker secrets in any response
