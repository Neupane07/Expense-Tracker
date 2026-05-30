# Project State

## Product

This repository is being evolved from an Expense Tracker into a broader personal finance platform called Finance OS.

The existing Expense Tracker module must continue working while new portfolio, market-data, scanner, risk, trade-journal, research, and MCP capabilities are added.

## Current branch

`feature/finance-os-foundation`

Update this if work continues on a new branch.

## Completed phases

### Phase 0: Finance OS foundation

Status: Completed

Completed work:

* Finance OS documentation foundation created.
* Existing expense-specific architecture moved/documented separately.
* Placeholder backend modules added for:

  * portfolio
  * broker
  * market-data
  * scanner
  * risk
  * trade-journal
  * research
* Placeholder frontend routes/pages added for new Finance OS areas.
* Existing expense tracker behavior intended to remain unchanged.
* No scanner logic implemented.
* No MCP server implemented.
* No order execution implemented.

### Phase 1: Read-only portfolio snapshot foundation

Status: Completed by Codex

Expected completed work:

* Dhan read-only sync foundation added.
* Portfolio snapshot foundation added.
* Broker/portfolio models or tables added as required.
* Holdings, positions, orders, trades, and funds sync support added or scaffolded.
* Raw broker payload storage added where applicable.
* Allocation calculation added.
* Data freshness or warning metadata added.
* Basic portfolio endpoints added.
* Tests added for normalization/allocation logic where applicable.
* Existing expense tracker behavior should remain unchanged.

### Phase 2: Mutual fund support and AMFI NAV valuation

Status: Completed by Codex

Expected completed work:

* Manual mutual fund holding CRUD added under the portfolio API.
* AMFI NAV sync support added using `AMFI_NAV_URL`, defaulting to AMFI `NAVAll.txt`.
* Mutual fund holdings match to AMFI schemes by normalized scheme name.
* Manual `schemeCode` override is supported and takes precedence over name matching.
* Mutual fund valuation is included in portfolio snapshots.
* NAV date and stale NAV warnings are returned in portfolio snapshot data-quality warnings.
* Tests added for AMFI NAV matching, valuation math, stale NAV warnings, and allocation math.
* Existing expense tracker behavior should remain unchanged.
* Scanner, MCP, and order execution remain unimplemented.

### Phase 3: Market data foundation and secure Dhan credentials

Status: Completed by Codex

Expected completed work:

* Dhan broker credentials are stored in DB encrypted at rest with AES-256-GCM.
* `FINANCE_OS_CREDENTIAL_KEY` is required for broker credential operations in non-test environments.
* Dhan API key, API secret, client ID, and access token are never returned to the frontend.
* Settings -> Broker Connections -> Dhan UI added for save, validate, and remove actions.
* Existing Dhan portfolio sync now uses saved encrypted credentials rather than `DHAN_CLIENT_ID` or `DHAN_ACCESS_TOKEN`.
* Instrument, price snapshot, daily candle, indicator snapshot, and data-quality warning tables added.
* Market-data services and endpoints added for instruments, latest prices, candles, and technical indicators.
* Dhan market-data provider added for read-only quote and historical candle data.
* Tests added for encryption, redaction, missing key failure, indicator calculations, stale prices, and missing candles.
* Existing expense tracker behavior should remain unchanged.
* Scanner, MCP, and order placement remain unimplemented.

### Phase 4: Deterministic risk engine

Status: Completed by Codex

Expected completed work:

* Configurable safe-default risk settings added.
* Position sizing service added for cash, capital-limit, and risk-limit based quantity calculation.
* Trade validation service added for user-provided BUY/DELIVERY trade setups only.
* Portfolio risk endpoint added with portfolio value, cash, active swing capital approximation, concentration, allocation, sector/theme exposure, and warnings.
* Trade validation rejects unknown symbols, stale/missing market data, invalid entry/target/stop loss, low risk/reward, invalid quantity, insufficient cash, non-DELIVERY products, MTF, and F&O.
* Trade validation warns for existing holdings, increased concentration, high single-stock concentration, and fallback/unofficial data sources.
* Tests added for deterministic risk calculations and rejection/warning paths.
* Existing expense tracker behavior should remain unchanged.
* Scanner, MCP, order placement, auto trading, MTF, and F&O remain unimplemented.

### Phase 5: Swing scanner foundation

Status: Completed by Codex

Expected completed work:

* Deterministic swing scan pipeline added using verified instruments, prices, candles, indicators, and portfolio/risk inputs.
* Initial setup types implemented: `BREAKOUT`, `PULLBACK_TO_SUPPORT`, `RSI_REVERSAL`.
* Hard rejects and confidence caps applied per `docs/SWING_SCANNER_MODULE.md` and `docs/RISK_RULES.md`.
* Each candidate includes entry/target/stop loss, risk/reward, suggested quantity, capital required, warnings, reject reasons, and data-quality metadata.
* Scanner endpoints added: `POST /scanner/swing/run` and `GET /scanner/swing/candidates`.
* Each candidate is validated through shared `POST /risk/validate-trade` logic (no duplicated risk math).
* Instrument lookup extended to holdings, orders, and trades mappings; uncertain symbols are rejected without guessing `securityId`.
* Read-only Swing Scanner UI added at `/scanner` with run action, results table, and candidate detail panel.
* Tests added for reject paths, confidence caps, stale/missing data, low risk/reward, portfolio-fit warnings, and no order placement behavior.
* Existing expense tracker behavior remains unchanged.
* MCP, order placement, auto trading, MTF/leverage, and F&O remain unimplemented.

### Phase 4.5: Finance OS portfolio, market-data, and risk UI

Status: Completed by Codex

Expected completed work:

* Portfolio placeholder page replaced with a functional read-only Finance OS UI.
* Portfolio Holdings tab shows snapshot, allocation, cash, warnings, data freshness, synced holdings, and synced orders.
* Read-only Dhan sync action added via `POST /portfolio/sync/dhan`; broker secrets remain API-only and are not displayed.
* Mutual Funds tab lists manual holdings, supports add/edit/delete through existing portfolio APIs, triggers AMFI NAV sync, and shows NAV date, value, cost, P&L, and warnings.
* Market Data tab looks up instruments, latest prices, candles, and indicators through existing market-data APIs and can trigger indicator recalculation.
* Risk tab validates user-entered BUY/DELIVERY setups, calculates position size, and shows portfolio risk from backend risk APIs.
* Scanner remains a placeholder and explicitly states scanner logic is not implemented yet.
* No scanner logic, MCP, order placement, auto trading, MTF/leverage, or F&O behavior was added.
* Existing expense tracker routes remain unchanged.

## Existing app status

The Expense module is the first completed module and must remain stable.

Existing functionality that must not break:

* Google session authentication
* statement upload
* XLS import
* statement parsing
* transaction normalization
* deduplication
* categorization rules
* transactions dashboard
* expense dashboard
* admin/invite/session behavior

Before merging any phase, verify:

```text
Can login
Can upload statement
Can parse statement
Can view transactions
Can create/update rules
Can view dashboard
Can access new placeholder Finance OS pages
```

## Current priority

Move from swing scanner foundation to the next safe foundation phase.

Next phase:

```text
Trade journal foundation
```

Next phase goal:

* Capture manual trade plans and post-trade reviews.
* Keep portfolio, scanner, and expense behavior stable.
* Do not implement MCP yet.
* Do not implement order execution.

## Hard boundaries

These rules apply to all upcoming phases:

```text
Do not break existing expense tracker behavior.
Do not implement auto trading.
Do not place orders.
Do not modify orders.
Do not cancel orders.
Do not recommend or use MTF/leverage.
Do not implement F&O.
Do not implement scanner before market-data and risk foundations are stable.
Do not expose broker secrets to frontend.
Do not store broker tokens in localStorage.
Do not mix expense transaction logic with portfolio/trading logic.
```

## Trading and investment boundary

Finance OS v1 is research-only.

Allowed:

* portfolio snapshot
* holdings sync
* mutual fund valuation
* active trade visibility
* market-data analysis
* scanner suggestions
* risk/reward validation
* suggested Dhan Super Order parameters
* trade journal

Not allowed in v1:

* auto-buy
* auto-sell
* auto-modify stop loss
* unattended trading
* MTF/leverage execution
* F&O execution

The user manually verifies and places all orders in Dhan.

## Data-quality principles

Every financial output should include data-quality metadata where possible.

Required concepts:

```text
source
asOf
lastSyncedAt
freshness
warnings
confidenceCapReason
rawPayload where useful for debugging
```

If data is stale, missing, unofficial, or partially synced, the UI/API must show a warning.

If symbol/security mapping is uncertain, trade validation/scanner must reject the setup later
