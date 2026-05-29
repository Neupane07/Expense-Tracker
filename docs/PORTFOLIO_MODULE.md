# Portfolio Module

## Purpose

The Portfolio module tracks the user's investment portfolio, cash, holdings, open positions, mutual funds, ETFs, active swing trades, allocation, concentration risk, and P&L.

This module is read-only in V1.

## Scope

V1 responsibilities:

- Store portfolio snapshots
- Import/sync listed holdings from broker
- Import/sync open positions from broker
- Import/sync orders/trades from broker where available
- Track available cash/margin
- Track mutual fund values from manual inputs and AMFI NAV
- Calculate allocation by asset class
- Calculate sector and theme exposure
- Calculate concentration risk
- Provide data to scanner and risk modules

Out of scope for V1:

- Auto order placement
- Portfolio rebalancing execution
- Tax filing
- F&O
- MTF/leverage
- Automatic SIP execution

## Planned Backend Structure

```text
src/portfolio/
  portfolio.module.ts
  portfolio.controller.ts
  portfolio.service.ts

  holdings.service.ts
  positions.service.ts
  mutual-funds.service.ts
  cash.service.ts
  allocation.service.ts
  exposure.service.ts
  portfolio-snapshot.service.ts
```

## Core Concepts

### Holding

A current owned investment.

Examples:

- listed stock
- ETF
- mutual fund

### Position

An active broker-side position/trade.

For now, this is read-only.

### Portfolio Snapshot

A point-in-time calculated view of:

- total value excluding cash
- available cash
- total including cash
- total P&L
- asset allocation
- listed holdings
- mutual funds
- open positions
- data quality warnings

### Mutual Fund Holding

MF ownership may be imported manually initially.

NAV must be fetched from AMFI where possible.

Each MF valuation must include:

- scheme name
- units
- cost
- NAV
- NAV date
- value
- P&L

## Data Quality

Every portfolio snapshot must include:

- snapshotTime
- brokerSyncStatus
- priceSource
- priceTimestamp
- mfNavSource
- mfNavDate
- warnings[]

If price source is unofficial/fallback, show warning.

If broker data is stale, show warning.

If MF NAV is not current, show warning.

## Risk Output

Portfolio module should provide:

- total equity exposure
- direct stock exposure
- mutual fund exposure
- ETF exposure
- cash percentage
- top holdings by weight
- sector/theme exposure
- active swing capital
- max loss if active trade stop-losses hit

## Portfolio Constraints

Default constraints for this user:

- No automated orders.
- No MTF/leverage.
- No F&O.
- Manual verification required before every trade.
- Maximum active swing trades: 2.
- Minimum risk/reward for swing setup: 1.8.

These should later become user-configurable settings.

## API Direction

Possible endpoints:

- `GET /portfolio/snapshot`
- `GET /portfolio/holdings`
- `GET /portfolio/mutual-funds`
- `GET /portfolio/allocation`
- `GET /portfolio/exposure`
- `GET /portfolio/risk`
- `POST /portfolio/sync`

All endpoints require authenticated session.

## Integration Boundaries

Portfolio module may use:

- broker for broker holdings/cash/orders
- market-data for prices
- risk for exposure and sizing
- research for supporting evidence

Portfolio module must not call external broker APIs directly once broker module exists.
