/** Approved read-only tools exposed through MCP (Phase 11 allowlist). */
export const MCP_ALLOWED_TOOL_NAMES = [
  'get_portfolio_snapshot',
  'get_market_data_status',
  'get_scanner_readiness',
  'scan_swing_candidates',
  'validate_trade_setup',
  'get_stock_deep_dive',
  'get_research_snapshot',
  'create_manual_super_order_plan',
] as const;

export type McpAllowedToolName = (typeof MCP_ALLOWED_TOOL_NAMES)[number];

/** Explicitly forbidden broker-write and journal-write tool names. */
export const MCP_FORBIDDEN_TOOL_NAMES = [
  'place_order',
  'modify_order',
  'cancel_order',
  'auto_trade',
  'trail_stop_loss',
  'record_trade_plan',
  'record_trade_exit',
] as const;

export const MCP_SERVER_NAME = 'finance-os-readonly';
export const MCP_SERVER_VERSION = '1.0.0';

export const DEFAULT_MCP_RATE_LIMIT_PER_MINUTE = 60;
