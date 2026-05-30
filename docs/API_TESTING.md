# API Testing

## Auth

1. Login through browser.
2. Copy session cookie.
3. Use cookie in Postman/curl.

## Portfolio tests

- GET /portfolio/snapshot
- POST /portfolio/sync/dhan
- GET /portfolio/holdings

## Mutual fund tests

- POST /portfolio/mutual-funds
- GET /portfolio/mutual-funds
- POST /portfolio/mutual-funds/nav/sync
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
- scanner, MCP, and order placement endpoints do not exist

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
