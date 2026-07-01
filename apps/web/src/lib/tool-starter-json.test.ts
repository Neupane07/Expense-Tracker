import { describe, expect, it } from "vitest"
import { buildStarterJson, parseJsonInput } from "./tool-starter-json"

describe("buildStarterJson", () => {
  it("returns empty object for no-input tools", () => {
    const json = buildStarterJson("get_portfolio_snapshot", { type: "object" })
    expect(JSON.parse(json)).toEqual({})
  })

  it("returns symbol starter for deep dive", () => {
    const json = buildStarterJson("get_stock_deep_dive", {
      type: "object",
      properties: { symbol: { type: "string" } },
      required: ["symbol"],
    })
    expect(JSON.parse(json)).toEqual({ symbol: "INFY" })
  })

  it("returns trade setup starter for validate_trade_setup", () => {
    const json = buildStarterJson("validate_trade_setup", { type: "object" })
    const parsed = JSON.parse(json) as Record<string, unknown>
    expect(parsed.symbol).toBe("INFY")
    expect(parsed.product).toBe("DELIVERY")
    expect(parsed.side).toBe("BUY")
  })
})

describe("parseJsonInput", () => {
  it("accepts valid JSON", () => {
    expect(parseJsonInput('{"symbol":"TCS"}')).toEqual({
      valid: true,
      value: { symbol: "TCS" },
    })
  })

  it("rejects invalid JSON syntax", () => {
    const result = parseJsonInput("{ symbol: INFY }")
    expect(result.valid).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it("rejects empty input", () => {
    const result = parseJsonInput("   ")
    expect(result.valid).toBe(false)
    expect(result.error).toContain("empty")
  })
})
