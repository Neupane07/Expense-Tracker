type JsonSchema = {
  type?: string
  properties?: Record<string, JsonSchema>
  required?: string[]
  items?: JsonSchema
  enum?: unknown[]
  default?: unknown
}

const TRADE_SETUP_STARTER = {
  symbol: "INFY",
  side: "BUY",
  entry: 1500,
  target: 1620,
  stopLoss: 1450,
  quantity: 5,
  product: "DELIVERY",
}

const TOOL_STARTER_OVERRIDES: Record<string, unknown> = {
  get_portfolio_snapshot: {},
  get_market_data_status: {},
  get_scanner_readiness: {},
  scan_swing_candidates: {},
  validate_trade_setup: TRADE_SETUP_STARTER,
  get_stock_deep_dive: { symbol: "INFY" },
  get_research_snapshot: { symbol: "INFY" },
  create_manual_super_order_plan: {
    ...TRADE_SETUP_STARTER,
    target: 1600,
  },
}

function sampleForProperty(name: string, schema: JsonSchema): unknown {
  if (schema.default !== undefined) {
    return schema.default
  }

  if (schema.enum && schema.enum.length > 0) {
    return schema.enum[0]
  }

  const type = schema.type ?? "string"

  if (name === "symbol") {
    return "INFY"
  }

  if (name === "side") {
    return "BUY"
  }

  if (name === "product") {
    return "DELIVERY"
  }

  if (name === "universe") {
    return "holdings"
  }

  if (name === "symbols") {
    return ["INFY"]
  }

  switch (type) {
    case "object":
      return buildFromSchema(schema)
    case "array":
      return schema.items ? [sampleForProperty("item", schema.items)] : []
    case "integer":
    case "number":
      if (name === "entry") return 1500
      if (name === "target") return 1620
      if (name === "stopLoss") return 1450
      if (name === "quantity") return 5
      return 0
    case "boolean":
      return false
    default:
      return ""
  }
}

function buildFromSchema(schema: JsonSchema): Record<string, unknown> {
  const properties = schema.properties ?? {}
  const required = schema.required ?? Object.keys(properties)
  const result: Record<string, unknown> = {}

  for (const key of required) {
    const propertySchema = properties[key]
    if (propertySchema) {
      result[key] = sampleForProperty(key, propertySchema)
    }
  }

  return result
}

export function buildStarterJson(
  toolName: string,
  inputSchema: Record<string, unknown>,
): string {
  const override = TOOL_STARTER_OVERRIDES[toolName]
  const starter =
    override !== undefined
      ? override
      : buildFromSchema(inputSchema as JsonSchema)

  return JSON.stringify(starter, null, 2)
}

export function parseJsonInput(text: string): {
  valid: boolean
  value?: unknown
  error?: string
} {
  const trimmed = text.trim()

  if (trimmed.length === 0) {
    return { valid: false, error: "Input cannot be empty." }
  }

  try {
    return { valid: true, value: JSON.parse(trimmed) as unknown }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid JSON syntax."
    return { valid: false, error: message }
  }
}

export function isToolInputValid(text: string) {
  return parseJsonInput(text).valid
}
