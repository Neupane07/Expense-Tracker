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

## Expected checks

- no secrets exposed
- warnings present
- values calculated correctly
- expense module still works