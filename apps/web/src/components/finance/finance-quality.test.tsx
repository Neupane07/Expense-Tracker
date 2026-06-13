import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import {
  DataQualityBadges,
  RESEARCH_ONLY_DISCLAIMER,
  ReadinessStatusBadge,
  RejectReasonList,
  ResearchDisclaimer,
  WarningsList,
} from "./finance-quality"

describe("finance quality rendering", () => {
  it("shows the research-only disclaimer text", () => {
    render(<ResearchDisclaimer />)

    expect(screen.getByTestId("research-disclaimer")).toHaveTextContent(
      RESEARCH_ONLY_DISCLAIMER,
    )
  })

  it("renders readiness status badges", () => {
    render(<ReadinessStatusBadge status="BLOCKED" />)

    expect(screen.getByTestId("readiness-status")).toHaveTextContent("BLOCKED")
  })

  it("renders warnings and reject reasons", () => {
    render(
      <>
        <WarningsList warnings={["PRICE_STALE"]} />
        <RejectReasonList reasons={["SYMBOL_NOT_VERIFIED"]} />
      </>,
    )

    expect(screen.getByTestId("warnings-list")).toHaveTextContent("PRICE_STALE")
    expect(screen.getByTestId("reject-reason-list")).toHaveTextContent(
      "SYMBOL_NOT_VERIFIED",
    )
  })

  it("renders data quality freshness and warnings together", () => {
    render(
      <DataQualityBadges
        dataQuality={{ freshness: "STALE", confidence: "LOW", source: "DHAN" }}
        warnings={["PRICE_STALE"]}
      />,
    )

    const panel = screen.getByTestId("data-quality-badges")
    expect(panel).toHaveTextContent("STALE")
    expect(panel).toHaveTextContent("LOW")
    expect(within(panel).getByTestId("warnings-list")).toHaveTextContent(
      "PRICE_STALE",
    )
  })
})
