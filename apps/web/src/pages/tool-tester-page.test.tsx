import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AuthProvider } from "@/auth/auth-context"
import App from "@/App"
import { ToolTesterPage } from "@/pages/tool-tester-page"
import type {
  ToolAuditItem,
  ToolCatalogResponse,
  ToolEnvelope,
} from "@/pages/tool-tester-types"

const mockApiGet = vi.fn()
const mockApiPostJson = vi.fn()
const mockUseApiQuery = vi.fn()

vi.mock("@/lib/api-client", () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiPostJson: (...args: unknown[]) => mockApiPostJson(...args),
  apiPostVoid: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number
    constructor(message: string, status: number) {
      super(message)
      this.status = status
    }
  },
}))

vi.mock("@/lib/use-api-query", () => ({
  useApiQuery: (...args: unknown[]) => mockUseApiQuery(...args),
}))

const catalog: ToolCatalogResponse = {
  readOnly: true,
  forbiddenToolNames: ["place_order"],
  tools: [
    {
      name: "get_portfolio_snapshot",
      version: "1",
      description: "Portfolio snapshot",
      readOnly: true,
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
    },
    {
      name: "create_manual_super_order_plan",
      version: "1",
      description: "Manual Super Order draft",
      readOnly: true,
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
    },
    {
      name: "validate_trade_setup",
      version: "1",
      description: "Validate trade setup",
      readOnly: true,
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
    },
  ],
}

const audits: ToolAuditItem[] = [
  {
    id: "audit-1",
    toolName: "get_portfolio_snapshot",
    toolVersion: "1",
    status: "ok",
    startedAt: "2026-06-14T10:00:00.000Z",
    completedAt: "2026-06-14T10:00:01.000Z",
    durationMs: 42,
    warningCount: 1,
    rejectCount: 0,
    errorCode: null,
    inputHash: "abc123",
    inputMeta: { keys: ["symbol"], fieldCount: 1 },
    createdAt: "2026-06-14T10:00:01.000Z",
  },
]

const successEnvelope: ToolEnvelope = {
  tool: "get_portfolio_snapshot",
  version: "1",
  asOf: "2026-06-14T10:00:00.000Z",
  status: "ok",
  data: { summary: { totalCurrentValue: 100000 } },
  dataQuality: { freshness: "LIVE", confidence: "HIGH", source: "DHAN" },
  warnings: ["PRICE_STALE"],
  rejectReasons: [],
  auditId: "audit-2",
  durationMs: 55,
}

const rejectedEnvelope: ToolEnvelope = {
  tool: "validate_trade_setup",
  version: "1",
  asOf: "2026-06-14T10:00:00.000Z",
  status: "rejected",
  data: {
    message: "Invalid tool input",
    details: {
      issues: [{ path: ["entry"], message: "Required" }],
    },
  },
  dataQuality: { error: true },
  warnings: [],
  rejectReasons: ["INVALID_INPUT"],
  auditId: "audit-3",
  durationMs: 8,
}

function mockQueries({
  catalogLoading = false,
  catalogError = null as string | null,
  auditsLoading = false,
  auditsError = null as string | null,
  refetch = vi.fn(),
} = {}) {
  mockUseApiQuery.mockImplementation((path: string) => {
    if (path === "/tools") {
      return {
        data: catalogLoading || catalogError ? null : catalog,
        error: catalogError,
        isLoading: catalogLoading,
        refetch: vi.fn(),
        path,
      }
    }

    if (path.startsWith("/tools/audits")) {
      return {
        data: auditsLoading || auditsError ? null : audits,
        error: auditsError,
        isLoading: auditsLoading,
        refetch,
        path,
      }
    }

    return {
      data: null,
      error: null,
      isLoading: false,
      refetch: vi.fn(),
      path,
    }
  })
}

function renderToolTester() {
  return render(
    <MemoryRouter initialEntries={["/tools"]}>
      <ToolTesterPage />
    </MemoryRouter>,
  )
}

describe("ToolTesterPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiPostJson.mockReset()
    mockQueries()
  })

  afterEach(() => {
    cleanup()
  })

  it("shows catalog loading state", () => {
    mockQueries({ catalogLoading: true })
    renderToolTester()
    expect(screen.getByText("Loading tool catalog")).toBeInTheDocument()
  })

  it("loads catalog and selects the first tool", async () => {
    renderToolTester()

    expect(await screen.findByTestId("tool-catalog-table")).toBeInTheDocument()
    expect(screen.getByTestId("tool-row-get_portfolio_snapshot")).toBeInTheDocument()
    expect(screen.getByTestId("tool-input-textarea")).toHaveValue("{}")
  })

  it("selects a tool and populates starter JSON", async () => {
    renderToolTester()
    await screen.findByTestId("tool-catalog-table")

    fireEvent.click(screen.getByTestId("tool-row-validate_trade_setup"))

    const textarea = screen.getByTestId("tool-input-textarea") as HTMLTextAreaElement
    expect(textarea.value).toContain('"symbol": "INFY"')
  })

  it("disables run for invalid JSON syntax", async () => {
    renderToolTester()
    await screen.findByTestId("tool-input-textarea")

    fireEvent.change(screen.getByTestId("tool-input-textarea"), {
      target: { value: "{ not-json" },
    })

    expect(screen.getByTestId("json-syntax-error")).toBeInTheDocument()
    expect(screen.getByTestId("tool-run-button")).toBeDisabled()
  })

  it("executes a tool and renders the envelope", async () => {
    const refetch = vi.fn()
    mockQueries({ refetch })
    mockApiPostJson.mockResolvedValue(successEnvelope)

    renderToolTester()
    await screen.findByTestId("tool-run-button")
    fireEvent.click(screen.getByTestId("tool-run-button"))

    await waitFor(() => {
      expect(mockApiPostJson).toHaveBeenCalledWith(
        "/tools/get_portfolio_snapshot/execute",
        {},
      )
    })

    const envelope = screen.getByTestId("tool-envelope-view")
    expect(envelope).toBeInTheDocument()
    expect(within(envelope).getByTestId("tool-status-badge")).toHaveTextContent("OK")
    expect(within(envelope).getByTestId("tool-audit-id")).toHaveTextContent("audit-2")
    expect(within(envelope).getByTestId("tool-duration")).toHaveTextContent("55 ms")
    expect(within(envelope).getByTestId("warnings-list")).toHaveTextContent("PRICE_STALE")
    expect(within(envelope).getByTestId("data-quality-badges")).toHaveTextContent("LIVE")
    expect(refetch).toHaveBeenCalled()
  })

  it("renders server validation errors from rejected envelopes", async () => {
    mockApiPostJson.mockResolvedValue(rejectedEnvelope)

    renderToolTester()
    await screen.findByTestId("tool-catalog-table")
    fireEvent.click(screen.getByTestId("tool-row-validate_trade_setup"))
    fireEvent.click(screen.getByTestId("tool-run-button"))

    expect(await screen.findByTestId("server-validation-error")).toHaveTextContent(
      "Invalid tool input",
    )
    expect(screen.getByTestId("reject-reason-list")).toHaveTextContent(
      "INVALID_INPUT",
    )
  })

  it("renders redacted audit history without secrets", async () => {
    renderToolTester()
    const page = await screen.findByTestId("tool-tester-page")
    const history = within(page).getByTestId("tool-audit-history")
    expect(within(history).getByText("get_portfolio_snapshot")).toBeInTheDocument()
    expect(within(history).getByText("symbol")).toBeInTheDocument()
    expect(history.textContent).not.toContain("apiKey")
    expect(history.textContent).not.toContain("accessToken")
  })

  it("shows manual draft disclaimer for create_manual_super_order_plan", async () => {
    renderToolTester()
    await screen.findByTestId("tool-catalog-table")

    fireEvent.click(
      screen.getByTestId("tool-row-create_manual_super_order_plan"),
    )

    expect(screen.getByTestId("manual-draft-disclaimer")).toHaveTextContent(
      "Manual draft only",
    )
    expect(screen.getByTestId("tool-run-button")).toHaveTextContent("Run tool")
  })

  it("does not persist tool input or results in browser storage", async () => {
    const localSet = vi.spyOn(Storage.prototype, "setItem")
    mockApiPostJson.mockResolvedValue(successEnvelope)

    renderToolTester()
    await screen.findByTestId("tool-run-button")
    fireEvent.click(screen.getByTestId("tool-run-button"))

    await waitFor(() => {
      expect(screen.getByTestId("tool-envelope-view")).toBeInTheDocument()
    })

    const storageKeys = localSet.mock.calls.map((call) => String(call[0]))
    expect(
      storageKeys.some((key) => /tool|input|envelope|audit/i.test(key)),
    ).toBe(false)

    localSet.mockRestore()
  })
})

describe("App routes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it("redirects unauthenticated users away from protected routes", async () => {
    mockApiGet.mockRejectedValue(new Error("Unauthorized"))

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={["/tools"]}>
          <App />
        </MemoryRouter>
      </AuthProvider>,
    )

    expect(
      await screen.findByText(/Access is invite-only/i),
    ).toBeInTheDocument()
  })

  it("includes /tools in authenticated app routes", async () => {
    mockApiGet.mockResolvedValue({
      authenticated: true,
      user: {
        id: "user-1",
        email: "user@example.com",
        name: "User",
        avatarUrl: null,
        role: "MEMBER",
      },
    })
    mockQueries()

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={["/tools"]}>
          <App />
        </MemoryRouter>
      </AuthProvider>,
    )

    expect(await screen.findByTestId("tool-tester-page")).toBeInTheDocument()
  })
})
