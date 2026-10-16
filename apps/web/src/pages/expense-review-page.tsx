import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AccountChoice,
  Choice,
  DateRange,
} from "@/components/expenses/expense-controls";
import { apiPostJson, buildQuery } from "@/lib/api-client";
import { useApiQuery } from "@/lib/use-api-query";
import type { Account, Transaction } from "./types";
import { ErrorState, LoadingState } from "./page-state";
type Preview = {
  transactions: Transaction[];
  revisions: Record<string, number>;
  manualLocked: string[];
  canRemember: boolean;
};
export function ExpenseReviewPage() {
  const [refresh, setRefresh] = useState(0),
    [accountId, setAccountId] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const [ids, setIds] = useState<string[]>([]),
    [preview, setPreview] = useState<Preview | null>(null);
  const [vendor, setVendor] = useState(""),
    [category, setCategory] = useState(""),
    [type, setType] = useState("EXPENSE"),
    [remember, setRemember] = useState(false);
  const [batchId, setBatchId] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const accounts = useApiQuery<Account[]>("/accounts");
  const q = useApiQuery<{
    groups: { key: string; transactions: Transaction[] }[];
    limited: boolean;
  }>(`/review${buildQuery({ accountId, from, to, refresh: String(refresh) })}`);
  function select(values: string[]) {
    setIds(values);
    setPreview(null);
    setRemember(false);
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Review exceptions</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <AccountChoice
            accounts={accounts.data ?? []}
            value={accountId}
            onChange={(v) => {
              setAccountId(v);
              select([]);
            }}
          />
          <DateRange
            from={from}
            to={to}
            onFrom={(v) => {
              setFrom(v);
              select([]);
            }}
            onTo={(v) => {
              setTo(v);
              select([]);
            }}
          />
        </CardContent>
      </Card>
      {(error || q.error) && <ErrorState message={error || q.error || ""} />}
      {message && <p role="status">{message}</p>}
      {q.isLoading && <LoadingState message="Loading exceptions" />}
      {q.data?.groups.length === 0 && (
        <p>
          No transaction classifications need review. Check Email intake for
          account mapping, passwords, and possible duplicates.
        </p>
      )}
      {q.data?.groups.map((g) => (
        <Card key={g.key}>
          <CardHeader>
            <CardTitle>
              {g.transactions[0].descriptionRaw} · {g.transactions.length}{" "}
              transactions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              variant="outline"
              onClick={() => select(g.transactions.map((t) => t.id))}
            >
              Select this group
            </Button>
            {g.transactions.map((t) => (
              <label
                key={t.id}
                className="flex items-center gap-3 rounded border p-3"
              >
                <input
                  type="checkbox"
                  checked={ids.includes(t.id)}
                  onChange={(e) =>
                    select(
                      e.target.checked
                        ? [...ids, t.id]
                        : ids.filter((i) => i !== t.id),
                    )
                  }
                />
                <span>
                  {t.transactionDate.slice(0, 10)} · {t.descriptionRaw} · ₹
                  {Number(t.moneyOut) || Number(t.moneyIn)}
                  <span className="block text-sm text-muted-foreground">
                    {t.account?.name} ·{" "}
                    {t.reviewReason ?? "Classification needed"}
                  </span>
                </span>
              </label>
            ))}
          </CardContent>
        </Card>
      ))}
      {ids.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Classify {ids.length} selected</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <Label>Merchant / payee</Label>
                <Input
                  value={vendor}
                  onChange={(e) => {
                    setVendor(e.target.value);
                    setPreview(null);
                  }}
                />
              </div>
              <div>
                <Label>Category</Label>
                <Input
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    setPreview(null);
                  }}
                />
              </div>
              <Choice
                label="Transaction type"
                value={type}
                onChange={(v) => {
                  setType(v);
                  setPreview(null);
                }}
                options={[
                  "EXPENSE",
                  "TRANSFER",
                  "INVESTMENT",
                  "INCOME",
                  "REFUND",
                  "REVIEW",
                ].map((v) => ({ value: v, label: v.toLowerCase() }))}
              />
            </div>
            <Button
              disabled={busy || !vendor || !category}
              onClick={() =>
                void run(async () =>
                  setPreview(
                    await apiPostJson<Preview>("/review/preview", { ids }),
                  ),
                )
              }
            >
              Preview changes
            </Button>
            {preview && (
              <>
                <p>
                  {preview.transactions.length} selected ·{" "}
                  {preview.manualLocked.length} manually locked. Locks are
                  skipped for bulk changes.
                </p>
                {preview.canRemember && (
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                    />
                    Remember for future matching transactions in this account
                  </label>
                )}
                <Button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const result = await apiPostJson<{
                        batchId: string;
                        updatedRows: number;
                      }>("/review/apply", {
                        ids,
                        revisions: preview.revisions,
                        category: { vendor, category, expenseType: type },
                        remember,
                        overwriteManual: ids.length === 1,
                      });
                      setBatchId(result.batchId);
                      setMessage(`Updated ${result.updatedRows} transactions.`);
                      select([]);
                      setRefresh((v) => v + 1);
                    })
                  }
                >
                  Apply to selected{remember ? " and remember" : ""}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}
      {batchId && (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const result = await apiPostJson<{
                restored: number;
                conflicts: string[];
                ruleConflict?: boolean;
              }>(`/review/${batchId}/undo`, {});
              setMessage(
                `Restored ${result.restored}. ${result.conflicts.length} later edits were preserved.${result.ruleConflict ? " The remembered rule was edited later and was preserved." : ""}`,
              );
              setBatchId("");
              setRefresh((v) => v + 1);
            })
          }
        >
          Undo last batch
        </Button>
      )}
    </div>
  );
}
