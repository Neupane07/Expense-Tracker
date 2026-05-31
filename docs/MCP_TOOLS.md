# MCP Tools

## Purpose

Finance OS may expose read-only MCP tools so an AI assistant can query verified portfolio, market, scanner, and risk data.

MCP tools are for decision support only.

They must not place, modify, or cancel orders in V1.

## Security Rules

MCP server must be protected.

Requirements:

```text
HTTPS only
strong API token
read-only by default
no broker secrets exposed
no Dhan token exposed
no raw session cookies exposed
audit log every tool call
```

If deployed publicly, use additional protections such as IP allowlist or private network access.

## Tool Categories

### Portfolio Tools

- get_portfolio_snapshot
- get_cash_and_margin
- get_holdings
- get_open_positions
- get_active_trades
- get_sector_exposure
- get_portfolio_risk_report

### Market Tools

- get_market_regime
- get_index_snapshot
- get_sector_strength
- get_global_cues
- get_fii_dii_flows

### Stock Tools

- get_stock_snapshot
- get_stock_technicals
- get_stock_fundamentals
- get_recent_filings
- get_news_summary
- get_peer_comparison

### Scanner Tools

- scan_swing_candidates
- scan_investment_candidates
- scan_breakouts
- scan_pullbacks
- scan_rsi_reversals
- scan_result_momentum

### Risk Tools

- validate_trade_setup
- suggest_position_size
- check_portfolio_fit
- check_if_trade_is_chasing
- create_super_order_plan

### Journal Tools

- get_trade_journal
- record_trade_plan
- record_trade_exit
- get_trade_review

## Tool Response Rules

Every tool response must include:

- asOf
- source
- dataQuality
- warnings

Scanner outputs must include:

- confidenceScore
- confidenceCapReason
- rejectReasons

## Example Tool: get_portfolio_snapshot

Input:

```json
{}
```

Output:

```json
{
  "asOf": "2026-05-29T09:30:00+05:30",
  "totalValue": 485995.70,
  "cash": 35039.75,
  "assetAllocation": [],
  "holdings": [],
  "activeTrades": [],
  "warnings": []
}
```

## Example Tool: validate_trade_setup

Input:

```json
{
  "symbol": "MOTHERSON",
  "side": "BUY",
  "entry": 143.5,
  "target": 156,
  "stopLoss": 137.5,
  "capital": 16000
}
```

Output:

```json
{
  "valid": true,
  "riskReward": 2.08,
  "suggestedQuantity": 110,
  "maxRisk": 660,
  "targetProfit": 1375,
  "warnings": [],
  "dataQuality": {
    "priceFreshness": "RECENT",
    "symbolVerified": true
  }
}
```

## Forbidden MCP Tools in V1

Do not expose:

- place_order
- modify_order
- cancel_order
- auto_trade
- auto_trail_stop_loss

Order execution must remain manual.
