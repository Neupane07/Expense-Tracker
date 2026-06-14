# Swing Scanner Module

## Purpose

The Swing Scanner module identifies possible swing trade setups using verified data, deterministic filters, risk/reward checks, market regime, and portfolio-fit rules.

It is a decision-support module only.

It must not place orders.

## Core Principle

The scanner should reject more trades than it accepts.

A trade candidate is useful only if it has:

- verified symbol
- recent price
- valid candles
- reasonable liquidity
- clear setup type
- defined entry
- defined target
- defined stop loss
- acceptable risk/reward
- portfolio-fit check
- no major unresolved data warning

## Setup Types

Implemented setup types:

```text
BREAKOUT
PULLBACK_TO_SUPPORT
RSI_REVERSAL
```

Possible later setup types, after the required research/sector/regime inputs
exist:

```text
RESULT_MOMENTUM
SECTOR_ROTATION
RELATIVE_STRENGTH
FAILED_BREAKDOWN_RECOVERY
```

## Swing Candidate Output

Each candidate must include:

- symbol
- name
- setupType
- entryZone
- target
- stopLoss
- riskReward
- suggestedQuantity
- capitalRequired
- maxRiskAmount
- targetProfitAmount
- confidenceScore
- confidenceCapReason
- technicalSummary
- fundamentalSummary
- newsSummary
- portfolioFit
- rejectReasons[]
- dataQuality

## Confidence Score

Confidence is 0 to 10.

Suggested interpretation:

- 8.0 - 9.0: Rare, very strong setup
- 7.0 - 8.0: Good actionable setup
- 6.0 - 7.0: Tradeable but not exceptional
- 5.0 - 6.0: Watchlist only
- Below 5.0: Avoid

Most real candidates should fall between 6.0 and 7.5.

The system must avoid overconfident scoring.

Suggested scoring weights:

- Technical structure: 30%
- Volume confirmation: 15%
- Risk/reward: 20%
- Sector/market regime: 10%
- Fundamental/news support: 10%
- Portfolio fit: 10%
- Liquidity/data quality: 5%

## Readiness Endpoint

`GET /scanner/readiness` is a read-only diagnostic endpoint. It checks:

- Dhan connection/credential presence
- latest broker sync age
- portfolio context (holdings/cash snapshots)
- per-symbol instrument mapping, stored price freshness, stored candles,
  indicators, and research freshness

Optional query:

- `?symbols=INFY,TCS` for an explicit universe
- default holdings-derived universe when omitted

The endpoint returns `READY`, `DEGRADED`, or `BLOCKED`, plus per-check warnings
and blockers. It does not run scans or fetch missing market data.

## Hard Reject Rules

The current scanner enforces verified mapping, price/candle availability,
shared risk validation, DELIVERY-only behavior, and confidence caps. The full
target gate below also requires a corporate-action/restricted-security data
source that is not implemented yet; until that exists, the scanner must not
claim those checks passed.

Reject candidate if:

- symbol mapping is uncertain
- live/recent price missing
- OHLC data missing
- risk/reward < 1.8
- stop loss is undefined
- target is undefined
- position size exceeds user risk limit
- stock has unresolved major negative corporate action
- stock is in restricted category
- candidate requires MTF/leverage
- candidate requires F&O

## Confidence Caps

Apply caps:

- Fallback price source: max 6.0
- No fresh news/filing check: max 6.5
- Volume data missing: max 6.0
- Already held with high exposure: max 6.5
- RSI above 70: max 6.5 unless breakout volume is exceptional
- Price more than 15% above SMA 50: max 6.2 unless setup is explicitly momentum breakout
- Market regime RISK_OFF: max 6.0 for new long trades

## Position Sizing

Inputs:

- availableCash
- maxCapitalPerTrade
- maxRiskPerTrade
- entry
- stopLoss

Position size must be calculated from risk first, not only from available capital.

Example:

```text
riskPerShare = entry - stopLoss
quantityByRisk = floor(maxRiskPerTrade / riskPerShare)
quantityByCapital = floor(maxCapitalPerTrade / entry)
suggestedQuantity = min(quantityByRisk, quantityByCapital)
```

## Output Order Parameters

Scanner may generate suggested Dhan Super Order parameters:

- side: BUY
- product: DELIVERY
- quantity
- limitPrice
- targetPrice
- stopLossPrice
- validity: DAY

It must also show:

> This is research-only. User must verify and place manually.

## API Direction

Possible endpoints:

- `GET /scanner/swing/candidates`
- `POST /scanner/swing/run`
- `POST /scanner/validate-trade`
- `POST /scanner/position-size`

## No Automation Boundary

The scanner must not:

- place orders
- modify orders
- cancel orders
- trail stop losses automatically
- send trade instructions to broker
