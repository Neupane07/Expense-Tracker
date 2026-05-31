# API Testing

## Auth

1. Login through browser.
2. Copy session cookie.
3. Use cookie in Postman/curl.

## Portfolio tests

- GET /portfolio/snapshot
- POST /portfolio/sync/dhan
- GET /portfolio/holdings
- GET /portfolio/orders

## Mutual fund tests

- POST /portfolio/mutual-funds
- GET /portfolio/mutual-funds
- PATCH /portfolio/mutual-funds/:holdingId
- DELETE /portfolio/mutual-funds/:holdingId
- POST /portfolio/sync/amfi-nav
- GET /portfolio/snapshot

## Broker connection tests

Set the API encryption key before starting the server:

```bash
export FINANCE_OS_CREDENTIAL_KEY="replace-with-at-least-32-random-bytes"
pnpm dev:api
```

Check the current Dhan connection. The response must contain only masked fields
and booleans:

```bash
curl -i \
  -H "Cookie: finance_os_session=<session-cookie>" \
  http://localhost:4000/broker/dhan/connection
```

Save Dhan credentials. Do not put these values in `.env`; they are encrypted in
the database by the API:

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
- MCP and order placement endpoints do not exist
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
- `/scanner` runs `POST /scanner/swing/run`, loads `GET /scanner/swing/candidates`, shows research-only disclaimer text, and can save a candidate to the journal.
- `/trade-journal` lists entries, creates manual plans, closes trades with review fields, and shows the manual-execution disclaimer.

## Scanner tests

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
