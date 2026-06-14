# Risk Rules

## Purpose

This document defines deterministic risk rules for Finance OS.

These rules are more important than scanner confidence.

A trade with a high score must still be rejected if it violates risk rules.

Implementation note: trade geometry, R:R, cash, position sizing, stale price,
product, MTF/F&O, and concentration checks are implemented. Canonical
active-trade reconciliation, stop-loss portfolio heat, and corporate-action
readiness blockers are implemented in Phase 8. Persisted per-user risk
settings remain roadmap work.

## Global Rules

V1 rules:

```text
No automated orders.
No MTF/leverage.
No F&O.
No unattended trading.
No averaging failed swing trades.
No revenge trades immediately after exit.
Manual verification required before order placement.
```

## Portfolio-Level Limits

Initial defaults:

- Maximum active swing trades: 2
- Maximum active swing capital: 15% - 20% of total portfolio
- Maximum risk per swing trade: 0.3% - 0.5% of total portfolio
- Minimum risk/reward: 1.8
- Preferred risk/reward: 2.0+
- Maximum single direct stock exposure: 10% unless explicitly marked core holding
- Maximum thematic exposure: configurable
- Cash reserve target: 5% - 10%

These values should later become user settings.

## Trade-Level Validation

A swing trade must have:

- entry price
- target price
- stop loss price
- quantity
- risk per share
- reward per share
- risk/reward
- capital required
- max loss amount
- target profit amount

Reject if:

- entry <= 0
- target <= entry for long trade
- stopLoss >= entry for long trade
- riskReward < minimum
- quantity <= 0
- capitalRequired > availableCash
- maxLossAmount > maxRiskPerTrade

## Data Quality Validation

Reject if:

- symbol/security ID is not verified
- latest price is stale beyond allowed threshold
- OHLC/candle data missing
- corporate action status unknown
- stock is suspended or inactive

Cap confidence if:

- price source is fallback/unofficial
- volume data is missing
- news/filing data is missing
- sector data is missing

## Existing Holding Rules

If stock is already held:

- scanner must show existing exposure
- scanner must show whether new trade increases concentration
- scanner must distinguish swing add from long-term add
- scanner must not recommend averaging down without a separate valid setup

If existing exposure is already high, cap confidence.

## Active Trade Rules

If there is already an active swing in the same stock:

- do not suggest a second trade unless explicitly requested
- show existing target and stop loss
- warn about overmanagement

If there are already 2 active swing trades:

- new swing candidates should be watchlist only

## Stop-Loss Rules

Stop loss should not be loosened after entry.

Allowed:

- move SL upward to reduce risk or lock profit
- trail SL based on defined rule
- exit manually if thesis breaks

Not allowed:

- move SL downward because price is falling
- average down after SL is near
- remove SL

## Target Rules

Target should not be increased near original target without a fresh setup.

If price nears target:

- book as planned
- or trail using predefined rule
- do not chase greed-based target extension

## Post-Trade Review

Every closed swing trade should record:

- entry date/time
- entry price
- exit date/time
- exit price
- planned target
- planned SL
- actual P&L
- reason for entry
- reason for exit
- mistake tags
- lesson learned

## Risk Output

Risk module should expose:

- available cash
- active swing capital
- max loss if all SLs hit
- sector exposure
- single-stock concentration
- portfolio heatmap
- open trade risk
- cash reserve
