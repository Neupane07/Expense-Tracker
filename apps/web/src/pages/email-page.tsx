import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AccountChoice,
  DateRange,
} from "@/components/expenses/expense-controls";
import {
  apiDelete,
  apiGet,
  apiPatchJson,
  apiPostJson,
  apiUrl,
} from "@/lib/api-client";
import { useApiQuery } from "@/lib/use-api-query";
import type { Account } from "./types";
import { ErrorState } from "./page-state";
type Connection = {
  id: string;
  email: string;
  status: string;
  lastCheckedAt: string | null;
  errorCode: string | null;
  _count: { jobs: number; documents: number };
};
type Observation = {
  id: string;
  status: string;
  transactionId: string | null;
  reason: string | null;
  parsed: {
    transactionDate?: string;
    descriptionRaw?: string;
    moneyIn?: number;
    moneyOut?: number;
    identifier?: string;
  };
};
type Document = {
  id: string;
  fileName: string;
  status: string;
  accountId: string | null;
  errorCode: string | null;
  deletedAt: string | null;
  observations?: Observation[];
};
export function EmailPage() {
  const [refresh, setRefresh] = useState(0),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [all, setAll] = useState(false);
  const [params] = useSearchParams();
  const linkedId = params.get("document");
  const linked = useApiQuery<Document>(linkedId ? `/source-documents/${encodeURIComponent(linkedId)}` : "");
  const [offset, setOffset] = useState(0);
  const [selectedState, setSelected] = useState<Document | null>(null),
    [accountId, setAccountId] = useState(""),
    [password, setPassword] = useState(""),
    [remember, setRemember] = useState(false);
  const selected = selectedState ?? linked.data;
  const [matchIds, setMatchIds] = useState<Record<string, string>>({});
  const connections = useApiQuery<{
    enabled: boolean;
    connections: Connection[];
  }>(`/email-connections?refresh=${refresh}`);
  const documents = useApiQuery<Document[]>(
    `/source-documents?refresh=${refresh}&offset=${offset}`,
  );
  const accounts = useApiQuery<Account[]>("/accounts");
  async function run(work: () => Promise<unknown>, text = "Saved.") {
    setBusy(true);
    setError("");
    try {
      await work();
      setMessage(text);
      setRefresh((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function open(id: string) {
    const doc = await apiGet<Document>(`/source-documents/${id}`);
    setSelected(doc);
    setAccountId(doc.accountId ?? "");
    setPassword("");
    setRemember(false);
  }
  async function documentAction(action: string, body: unknown = {}) {
    if (!selected) return;
    const doc = await apiPostJson<Document>(
      `/source-documents/${selected.id}/${action}`,
      body,
    );
    setSelected(doc);
    setPassword("");
  }
  return (
    <div className="space-y-5">
      {(error || connections.error || documents.error || linked.error) && (
        <ErrorState
          message={error || connections.error || documents.error || linked.error || ""}
        />
      )}
      {message && <p role="status">{message}</p>}
      <Card>
        <CardHeader>
          <CardTitle>Email connections</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>
            Connect Gmail to discover ICICI bank and Amazon Pay card activity.
            Google grants mailbox-wide read permission; this app fetches
            supported financial messages and does not send or modify mail.
          </p>
          <p className="text-sm text-muted-foreground">
            Preview the last 90 days by default, confirm account mappings, then
            enable automatic capture. Historical statements can be imported at
            any time.
          </p>
          {!connections.data?.enabled && (
            <p>Gmail capture is not enabled on this server yet.</p>
          )}
          <Button
            disabled={busy || !connections.data?.enabled}
            onClick={() =>
              void run(async () => {
                const result = await apiPostJson<{ url: string }>(
                  "/email-connections/connect",
                  {},
                );
                window.location.assign(result.url);
              })
            }
          >
            Connect Gmail
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => setRefresh((v) => v + 1)}
          >
            Refresh status
          </Button>
          <div className="grid gap-3 md:grid-cols-2">
            <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={all}
              onChange={(e) => {
                setAll(e.target.checked);
                if (e.target.checked) setFrom("");
              }}
            />
            All available history
          </label>
          {connections.data?.connections.map((c) => (
            <div className="space-y-3 rounded border p-4" key={c.id}>
              <div className="flex justify-between">
                <strong>{c.email}</strong>
                <Badge>{c.status.replaceAll("_", " ")}</Badge>
              </div>
              <p className="text-sm">
                Last checked:{" "}
                {c.lastCheckedAt
                  ? new Date(c.lastCheckedAt).toLocaleString()
                  : "Not checked"}{" "}
                · {c._count.jobs} queued jobs · {c._count.documents} documents
                needing attention
              </p>
              {c.errorCode && <p>{c.errorCode.replaceAll("_", " ")}</p>}
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={busy || !["PREVIEW", "ACTIVE"].includes(c.status)}
                  onClick={() =>
                    void run(
                      () =>
                        apiPostJson(`/email-connections/${c.id}/backfill`, {
                          from: from || undefined,
                          to: to || undefined,
                          allHistory: all,
                        }),
                      "History scan queued. Refresh status to see progress.",
                    )
                  }
                >
                  Preview / scan history
                </Button>
                <Button
                  variant="outline"
                  disabled={busy || c.status === "DISCONNECTED"}
                  onClick={() =>
                    void run(() =>
                      apiPatchJson(`/email-connections/${c.id}`, {
                        action: c.status === "ACTIVE" ? "pause" : "activate",
                      }),
                    )
                  }
                >
                  {c.status === "ACTIVE" ? "Pause" : "Enable capture"}
                </Button>
                <Button
                  variant="outline"
                  disabled={busy || c.status === "DISCONNECTED"}
                  onClick={() =>
                    void run(async () => {
                      const result = await apiPatchJson<{ warning?: string }>(
                        `/email-connections/${c.id}`,
                        { action: "disconnect" },
                      );
                      if (result.warning) setError(result.warning);
                    }, "Disconnected. Imported history is retained.")
                  }
                >
                  Disconnect
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Intake and preview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">
            Unknown templates and possible duplicates require your review.{" "}
            <Link to="/accounts">Manage accounts</Link> ·{" "}
            <Link to="/imports">Upload a missing statement</Link>
          </p>
          {documents.data?.length === 0 && (
            <p>
              No financial messages imported yet. Connect Gmail and scan a
              history window.
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 200))}>Newer documents</Button>
            <Button variant="outline" disabled={(documents.data?.length ?? 0) < 200} onClick={() => setOffset(offset + 200)}>Older documents</Button>
          </div>
          {documents.data?.map((d) => (
            <button
              key={d.id}
              className="flex w-full items-center justify-between rounded border p-3 text-left"
              onClick={() => void run(() => open(d.id), "Document opened.")}
            >
              <span>{d.fileName}</span>
              <Badge>{d.status.replaceAll("_", " ")}</Badge>
            </button>
          ))}
        </CardContent>
      </Card>
      {selected && (
        <Card>
          <CardHeader>
            <CardTitle>{selected.fileName}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {selected.errorCode && (
              <p>{selected.errorCode.replaceAll("_", " ")}</p>
            )}
            <AccountChoice
              accounts={accounts.data ?? []}
              value={accountId}
              onChange={setAccountId}
              all={false}
            />
            <Button
              disabled={busy || !accountId || !!selected.deletedAt}
              onClick={() =>
                void run(() => documentAction("map", { accountId }))
              }
            >
              Confirm account mapping
            </Button>
            {selected.status === "PASSWORD_REQUIRED" && (
              <div className="space-y-3">
                <Label>Statement password</Label>
                <Input
                  type="password"
                  autoComplete="off"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                  />
                  Remember encrypted password for this account
                </label>
                <Button
                  disabled={busy || !password}
                  onClick={() =>
                    void run(() =>
                      documentAction("password", { password, remember }),
                    )
                  }
                >
                  Unlock statement
                </Button>
              </div>
            )}
            <div className="space-y-3">
              {selected.observations?.map((o) => (
                <div className="rounded border p-3" key={o.id}>
                  <p>
                    {o.parsed.transactionDate} · {o.parsed.descriptionRaw} · ₹
                    {o.parsed.moneyOut || o.parsed.moneyIn || 0}
                  </p>
                  <p className="text-sm">
                    {o.parsed.identifier &&
                      `Account identifier: ${o.parsed.identifier} · `}
                    {o.status.replaceAll("_", " ")}
                  </p>
                  {o.transactionId && (
                    <Link
                      to={`/transactions/${o.transactionId}`}
                    >
                      View transaction
                    </Link>
                  )}
                  {o.status === "NEEDS_MATCH" && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Input
                        aria-label="Existing transaction ID"
                        placeholder="Existing transaction ID"
                        value={matchIds[o.id] ?? ""}
                        onChange={(e) =>
                          setMatchIds({ ...matchIds, [o.id]: e.target.value })
                        }
                      />
                      <Button
                        disabled={busy || !matchIds[o.id]}
                        onClick={() =>
                          void run(() =>
                            documentAction(`observations/${o.id}/resolve`, {
                              transactionId: matchIds[o.id],
                            }),
                          )
                        }
                      >
                        Link existing
                      </Button>
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          void run(() =>
                            documentAction(`observations/${o.id}/resolve`, {
                              separate: true,
                            }),
                          )
                        }
                      >
                        Confirm separate purchase
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={
                  busy ||
                  !selected.accountId ||
                  !!selected.errorCode ||
                  !!selected.deletedAt ||
                  !selected.observations?.length
                }
                onClick={() => void run(() => documentAction("post"))}
              >
                Confirm preview and add transactions
              </Button>
              <Button
                variant="outline"
                disabled={busy || !!selected.deletedAt}
                onClick={() => void run(() => documentAction("retry"))}
              >
                Retry parsing
              </Button>
              {!selected.deletedAt && (
                <a href={apiUrl(`/source-documents/${selected.id}/download`)}>
                  Download original evidence
                </a>
              )}
              <Button
                variant="destructive"
                disabled={busy || !!selected.deletedAt}
                onClick={() => {
                  if (
                    window.confirm(
                      "Delete this source content and its saved account password? Financial transactions remain.",
                    )
                  )
                    void run(async () => {
                      await apiDelete(`/source-documents/${selected.id}`);
                      await open(selected.id);
                    });
                }}
              >
                Delete source data
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
