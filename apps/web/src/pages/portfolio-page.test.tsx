import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"
import { PortfolioPage } from "@/pages/portfolio-page"

const mockApiPostJson = vi.fn()
const mockUseApiQuery = vi.fn()

vi.mock("@/lib/api-client", () => ({
  apiGet: vi.fn(),
  apiPostJson: (...args: unknown[]) => mockApiPostJson(...args),
  apiPatchJson: vi.fn(),
  apiDelete: vi.fn(),
}))

vi.mock("@/lib/use-api-query", () => ({
  useApiQuery: (...args: unknown[]) => mockUseApiQuery(...args),
}))

describe("PortfolioPage sync handling", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("uses sync response snapshot and holdings instead of waiting for duplicate refetches", async () => {
    const snapshot = {
      id: "snapshot-1",
      snapshotTime: "2026-07-01T10:00:00.000Z",
      brokerAccountId: "broker-1",
      allocation: {
        stockValue: 100,
        etfValue: 0,
        mutualFundValue: 0,
        cashValue: 10,
        totalValue: 110,
        stockPercent: 90.91,
        etfPercent: 0,
        mutualFundPercent: 0,
        cashPercent: 9.09,
      },
      summary: {
        totalInvested: 100,
        totalCurrentValue: 110,
        totalPnl: 10,
        totalPnlPercent: 10,
        dayPnl: 1,
        dayPnlPercent: 1,
        listed: {
          invested: 100,
          currentValue: 100,
          pnl: 0,
          pnlPercent: 0,
          dayPnl: 1,
          dayPnlPercent: 1,
          stockInvested: 100,
          stockCurrentValue: 100,
          etfInvested: 0,
          etfCurrentValue: 0,
          pricedCount: 1,
          fallbackCount: 0,
          holdingCount: 1,
        },
        mutualFunds: {
          invested: 0,
          currentValue: 0,
          pnl: 0,
          pnlPercent: null,
          holdingCount: 0,
        },
        cash: 10,
      },
      listedSummary: {
        invested: 100,
        currentValue: 100,
        pnl: 0,
        pnlPercent: 0,
        dayPnl: 1,
        dayPnlPercent: 1,
        stockInvested: 100,
        stockCurrentValue: 100,
        etfInvested: 0,
        etfCurrentValue: 0,
        pricedCount: 1,
        fallbackCount: 0,
        holdingCount: 1,
      },
      priceAsOf: "2026-07-01T10:00:00.000Z",
      mutualFunds: {
        asOf: "2026-07-01T10:00:00.000Z",
        holdings: [],
        totalValue: 0,
        totalInvested: 0,
        totalPnl: 0,
        totalPnlPercent: null,
        warnings: [],
      },
      warnings: [],
      source: {
        brokerProvider: "DHAN",
        syncRunId: "sync-1",
        holdingCount: 1,
        fundSnapshotId: null,
        mutualFundHoldingCount: 0,
      },
    }
    const holdings = {
      holdings: [
        {
          id: "holding-1",
          asOf: "2026-07-01T10:00:00.000Z",
          exchange: "NSE",
          tradingSymbol: "INFY",
          securityId: "1",
          isin: null,
          assetClass: "STOCK",
          totalQty: 10,
          availableQty: 10,
          avgCostPrice: 10,
          costValue: 100,
          marketValue: 110,
          ltp: 11,
          previousClose: 10,
          investedValue: 100,
          currentValue: 110,
          pnl: 10,
          pnlPercent: 10,
          dayPnl: 10,
          dayPnlPercent: 10,
          priceSource: "DHAN",
          priceTimestamp: "2026-07-01T10:00:00.000Z",
          priceFreshness: "LIVE",
          warnings: [],
        },
      ],
      summary: snapshot.listedSummary,
      priceAsOf: snapshot.priceAsOf,
      warnings: [],
    }

    mockUseApiQuery.mockImplementation((path: string) => {
      if (path.startsWith("/portfolio/snapshot")) {
        return { data: null, error: null, isLoading: false }
      }
      if (path.startsWith("/portfolio/holdings")) {
        return { data: null, error: null, isLoading: false }
      }
      return { data: [], error: null, isLoading: false }
    })

    mockApiPostJson.mockResolvedValue({
      sync: {
        syncRunId: "sync-1",
        provider: "DHAN",
        counts: { holdings: 1, orders: 0 },
        warnings: [],
      },
      snapshot,
      holdings,
    })

    render(
      <MemoryRouter>
        <PortfolioPage />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole("button", { name: /sync dhan/i }))

    await waitFor(() => {
      expect(screen.getByText(/INFY/i)).toBeInTheDocument()
    })

    expect(mockApiPostJson).toHaveBeenCalledWith("/portfolio/sync/dhan", {})
    expect(screen.getByText(/Dhan sync completed/i)).toBeInTheDocument()
  })
})
