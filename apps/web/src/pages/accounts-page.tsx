import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Choice, DateRange } from "@/components/expenses/expense-controls";
import { apiPatchJson, apiPostJson, buildQuery } from "@/lib/api-client";
import { useApiQuery } from "@/lib/use-api-query";
import type { Account } from "./types";
import { ErrorState, LoadingState } from "./page-state";
type Identifier = {
  id: string;
  value: string;
  validFrom: string | null;
  validTo: string | null;
};
type AccountDetail = Account & { identifiers: Identifier[] };
type Coverage = {
  months: { month: string; status: string }[];
  truncated: boolean;
};
export function AccountsPage() {
  const [refresh, setRefresh] = useState(0),
    [showAll, setShowAll] = useState(false),
    [error, setError] = useState("");
  const [name, setName] = useState(""),
    [type, setType] = useState("BANK_ACCOUNT");
  const q = useApiQuery<Account[]>(`/accounts?refresh=${refresh}`);
  async function add() {
    try {
      await apiPostJson("/accounts", { name, institution: "ICICI Bank", type });
      setName("");
      setRefresh((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Accounts and cards</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>
            Keep one account history across replacement cards. Closing or
            archiving preserves all past activity.
          </p>
          <Button variant="outline" onClick={() => setShowAll(!showAll)}>
            {showAll ? "Show active only" : "Include closed and archived"}
          </Button>
          {q.isLoading && <LoadingState message="Loading accounts" />}
          {(q.error || error) && <ErrorState message={q.error || error} />}
          {q.data
            ?.filter((a) => showAll || (!a.closedAt && !a.archivedAt))
            .map((a) => (
              <Link
                className="flex justify-between rounded-lg border p-4"
                key={a.id}
                to={`/accounts/${a.id}`}
              >
                <span>
                  {a.name} {a.lastFour && `•${a.lastFour}`}
                </span>
                <Badge>
                  {a.archivedAt ? "Archived" : a.closedAt ? "Closed" : "Active"}
                </Badge>
              </Link>
            ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Add account</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <Input
            aria-label="Account name"
            placeholder="Account name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Choice
            label="Type"
            value={type}
            onChange={setType}
            options={[
              { value: "BANK_ACCOUNT", label: "ICICI bank account" },
              { value: "CREDIT_CARD", label: "Amazon Pay credit card" },
            ]}
          />
          <Button disabled={!name.trim()} onClick={() => void add()}>
            Add account
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
export function AccountDetailPage() {
  const { id } = useParams(),
    [refresh, setRefresh] = useState(0),
    [error, setError] = useState("");
  const [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [identifier, setIdentifier] = useState("");
  const [validFrom, setValidFrom] = useState(""),
    [validTo, setValidTo] = useState("");
  const q = useApiQuery<AccountDetail>(`/accounts/${id}?refresh=${refresh}`);
  const coverage = useApiQuery<Coverage>(
    `/accounts/${id}/coverage${buildQuery({ from, to, refresh: String(refresh) })}`,
  );
  async function change(body: unknown) {
    try {
      await apiPatchJson(`/accounts/${id}`, body);
      setRefresh((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function addIdentifier() {
    try {
      await apiPostJson(`/accounts/${id}/identifiers`, {
        value: identifier,
        sourceType:
          q.data?.type === "BANK_ACCOUNT"
            ? "ICICI_BANK"
            : "ICICI_AMAZON_PAY_CARD",
        validFrom: validFrom || undefined,
        validTo: validTo || undefined,
      });
      setIdentifier("");
      setRefresh((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (!q.data)
    return q.error ? (
      <ErrorState message={q.error} />
    ) : (
      <LoadingState message="Loading account" />
    );
  const a = q.data;
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>{a.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <ErrorState message={error} />}
          <div className="flex flex-wrap gap-3">
            <Link to={`/transactions?accountId=${id}`}>View transactions</Link>
            <Link to={`/email?accountId=${id}`}>Add history from email</Link>
            <Button
              variant="outline"
              onClick={() => void change({ archived: !a.archivedAt })}
            >
              {a.archivedAt ? "Unarchive" : "Archive"}
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                void change({ reviewEverything: !a.reviewEverything })
              }
            >
              {a.reviewEverything
                ? "Review exceptions only"
                : "Review every transaction"}
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Opened on (optional)</Label>
              <Input
                aria-label="Opened on"
                type="date"
                defaultValue={a.openedAt?.slice(0, 10) ?? ""}
                onBlur={(e) => {
                  if (e.target.value !== (a.openedAt?.slice(0, 10) ?? ""))
                    void change({ openedAt: e.target.value || null });
                }}
              />
            </div>
            <div>
              <Label>Closed on (empty means active)</Label>
              <Input
                aria-label="Closed on"
                type="date"
                defaultValue={a.closedAt?.slice(0, 10) ?? ""}
                onBlur={(e) => {
                  if (e.target.value !== (a.closedAt?.slice(0, 10) ?? ""))
                    void change({ closedAt: e.target.value || null });
                }}
              />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Closing does not erase balances or prevent late refunds and
            historical imports.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Card and account identifiers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">
            Add the masked identifier shown in your bank emails. Associate
            replacement cards here to preserve the same account history.
          </p>
          {a.identifiers.map((i) => (
            <p key={i.id}>
              {i.value} · {i.validFrom?.slice(0, 10) ?? "Unknown start"} —{" "}
              {i.validTo?.slice(0, 10) ?? "Current"}
            </p>
          ))}
          <Input
            aria-label="Masked identifier"
            placeholder="Identifier, e.g. 1234"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
          />
          <div className="grid gap-3 md:grid-cols-2">
            <DateRange
              from={validFrom}
              to={validTo}
              onFrom={setValidFrom}
              onTo={setValidTo}
            />
          </div>
          <Button disabled={!identifier} onClick={() => void addIdentifier()}>
            Associate identifier
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>History coverage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
          </div>
          <p className="text-sm text-muted-foreground">
            Missing means no verified statement coverage, not zero spending.
            Legacy imports do not prove a complete statement period.
          </p>
          {coverage.error && <ErrorState message={coverage.error} />}
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {coverage.data?.months.map((m) => (
              <div key={m.month} className="rounded border p-3">
                <div>{m.month}</div>
                <div className="text-xs">
                  {m.status.replaceAll("_", " ").toLowerCase()}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
