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

Move from Phase 1 to Phase 2.

Next phase:

```text
Phase 2: Mutual fund support and AMFI NAV valuation
```

Phase 2 goal:

* Add manual mutual fund holding support.
* Add AMFI NAV sync support.
* Match mutual fund holdings to AMFI schemes.
* Include mutual funds in portfolio snapshot.
* Show NAV date and stale NAV warnings.
* Keep existing expense tracker behavior unchanged.
* Do not implement scanner yet.
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

If symbol/security mapping is uncertain, trade validation/scanner must reject the setup later.