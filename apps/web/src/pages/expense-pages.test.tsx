import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AccountsPage } from "./accounts-page";
import { EmailPage } from "./email-page";
import { ExpenseReviewPage } from "./expense-review-page";
const query = vi.fn(),
  post = vi.fn();
vi.mock("@/lib/use-api-query", () => ({
  useApiQuery: (...args: unknown[]) => query(...args),
}));
vi.mock("@/lib/api-client", () => ({
  apiPostJson: (...args: unknown[]) => post(...args),
  apiPatchJson: vi.fn(),
  apiDelete: vi.fn(),
  apiGet: vi.fn(),
  apiUrl: (s: string) => s,
  buildQuery: () => "",
}));
const account = {
  id: "a",
  name: "Active card",
  type: "CREDIT_CARD",
  closedAt: null,
  archivedAt: null,
};
describe("expense workflows", () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("hides closed accounts only from the active list, with an explicit history toggle", () => {
    query.mockReturnValue({
      data: [
        account,
        { ...account, id: "b", name: "Old card", closedAt: "2024-01-01" },
      ],
      isLoading: false,
      error: null,
    });
    render(
      <MemoryRouter>
        <AccountsPage />
      </MemoryRouter>,
    );
    expect(screen.queryByText("Old card")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Include closed and archived" }),
    );
    expect(screen.getByText("Old card")).toBeInTheDocument();
  });
  it("discloses Gmail scope and disables connect while server capture is disabled", () => {
    query.mockImplementation((path: string) => ({
      data: path.startsWith("/email-connections")
        ? { enabled: false, connections: [] }
        : [],
      isLoading: false,
      error: null,
    }));
    render(
      <MemoryRouter>
        <EmailPage />
      </MemoryRouter>,
    );
    expect(
      screen.getByText(/mailbox-wide read permission/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Connect Gmail" }),
    ).toBeDisabled();
  });
  it("requires a preview before applying a group classification", async () => {
    const tx = {
      id: "t",
      descriptionRaw: "SHOP",
      transactionDate: "2026-10-01",
      moneyOut: 10,
      moneyIn: 0,
      account,
      category: null,
    };
    query.mockImplementation((path: string) => ({
      data: path.startsWith("/accounts")
        ? [account]
        : { groups: [{ key: "g", transactions: [tx] }] },
      isLoading: false,
      error: null,
    }));
    post.mockResolvedValue({
      transactions: [tx],
      revisions: { t: 0 },
      manualLocked: [],
      canRemember: true,
    });
    render(
      <MemoryRouter>
        <ExpenseReviewPage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Select this group" }));
    expect(
      screen.queryByRole("button", { name: "Apply to selected" }),
    ).not.toBeInTheDocument();
    const inputs = screen.getAllByRole("textbox");
    fireEvent.change(inputs[0], { target: { value: "Shop" } });
    fireEvent.change(inputs[1], { target: { value: "Food" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview changes" }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/review/preview", { ids: ["t"] }),
    );
    expect(
      await screen.findByRole("button", { name: "Apply to selected" }),
    ).toBeInTheDocument();
  });
});
