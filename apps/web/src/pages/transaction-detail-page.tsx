import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Choice } from "@/components/expenses/expense-controls";
import { apiPatchJson } from "@/lib/api-client";
import { useApiQuery } from "@/lib/use-api-query";
import type { Transaction } from "./types";
import { ErrorState, LoadingState } from "./page-state";
type Detail = Transaction & {
  id: string;
  transferPairId: string | null;
  reversalOfId: string | null;
  category:
    | (NonNullable<Transaction["category"]> & {
        notes?: string;
        isManual?: boolean;
        rule?: { id: string; pattern: string; merchantKey?: string; origin?: string } | null;
      })
    | null;
  observations: {
    id: string;
    documentId: string;
    document: { fileName: string; deletedAt: string | null; status: string };
  }[];
  decisions: { id: string; batchId: string; createdAt: string; undone: boolean; before: { category: { category: string; vendor: string; expenseType: string } | null } }[];
};
export function TransactionDetailPage() {
  const { id } = useParams(),
    [refresh, setRefresh] = useState(0),
    [error, setError] = useState("");
  const q = useApiQuery<Detail>(`/transactions/${id}?refresh=${refresh}`);
  const [vendor, setVendor] = useState(""),
    [category, setCategory] = useState(""),
    [type, setType] = useState("EXPENSE"),
    [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false);
  if (!q.data)
    return q.error ? (
      <ErrorState message={q.error} />
    ) : (
      <LoadingState message="Loading transaction" />
    );
  const t = q.data;
  async function save() {
    setBusy(true);
    try {
      await apiPatchJson(`/transactions/${id}/category`, {
        vendor,
        category,
        expenseType: type,
      });
      setEditing(false);
      setRefresh((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t.descriptionRaw}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && <ErrorState message={error} />}
          <p>
            {t.transactionDate.slice(0, 10)} · {t.account?.name} · ₹
            {Number(t.moneyOut) || Number(t.moneyIn)} ·{" "}
            {t.confirmation?.toLowerCase()}
          </p>
          <p>
            {t.category?.category ?? "Uncategorized"} ·{" "}
            {t.category?.expenseType.toLowerCase()}
          </p>
          <p>
            {t.category?.notes ?? t.reviewReason}{" "}
            {t.category?.isManual && "Manually set; protected from automation."}
          </p>
          {t.category?.rule && <p>Rule: <Link to="/rules">{t.category.rule.pattern || t.category.rule.merchantKey || t.category.rule.id}</Link> · {t.category.rule.origin?.toLowerCase()}</p>}
          {t.reversalOfId && <p><Link to={`/transactions/${t.reversalOfId}`}>View original reversed transaction</Link></p>}
          <p className="break-all text-sm">Transaction ID: {t.id}</p>
          {t.category?.expenseType === "TRANSFER" && (
            <p>
              {t.transferPairId ? (
                <Link to={`/transactions/${t.transferPairId}`}>
                  View transfer counterpart
                </Link>
              ) : (
                "Counterpart not yet linked."
              )}
            </p>
          )}
          <Button
            variant="outline"
            onClick={() => {
              setVendor(t.category?.vendor ?? "");
              setCategory(t.category?.category ?? "");
              setType(t.category?.expenseType ?? "REVIEW");
              setEditing(true);
            }}
          >
            Edit classification
          </Button>
          {editing && (
            <div className="space-y-3">
              <Label>Merchant / payee</Label>
              <Input
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
              />
              <Label>Category</Label>
              <Input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
              <Choice
                label="Type"
                value={type}
                onChange={setType}
                options={[
                  "EXPENSE",
                  "TRANSFER",
                  "INVESTMENT",
                  "INCOME",
                  "REFUND",
                  "REVIEW",
                ].map((v) => ({ value: v, label: v.toLowerCase() }))}
              />
              <Button
                disabled={busy || !vendor || !category}
                onClick={() => void save()}
              >
                Save manual override
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Evidence and history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {t.observations.length ? (
            t.observations.map((o) => (
              <p key={o.id}>
                {o.document.fileName}{" "}{o.document.status === "ORIGINAL_UNAVAILABLE" && "(original file unavailable) "}
                {o.document.deletedAt ? (
                  "(source deleted)"
                ) : (
                  <Link to={`/email?document=${encodeURIComponent(o.documentId)}`}>Inspect evidence</Link>
                )}
              </p>
            ))
          ) : (
            <p>Legacy import: original source may not be available.</p>
          )}
          {t.decisions.map((d) => (
            <p key={d.id}>
              {new Date(d.createdAt).toLocaleString()} · Classification decision
              recorded{d.undone ? " (undone)" : ""}. Previously: {d.before.category ? `${d.before.category.vendor} / ${d.before.category.category} / ${d.before.category.expenseType.toLowerCase()}` : "unclassified"}
            </p>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
