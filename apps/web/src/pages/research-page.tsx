import { type FormEvent, useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { BookOpenText, RefreshCw, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { apiDelete, apiPostJson } from "@/lib/api-client"
import { formatDateTime } from "@/lib/format"
import { useApiQuery } from "@/lib/use-api-query"
import { EmptyState, ErrorState, LoadingState } from "./page-state"

type ResearchCategory =
  | "RESULT"
  | "ORDER_WIN"
  | "CORPORATE_ACTION"
  | "REGULATORY"
  | "MANAGEMENT_COMMENTARY"
  | "SECTOR_NEWS"
  | "COMPANY_NEWS"
  | "USER_NOTE"
  | "RISK_FLAG"
  | "OTHER"

type ResearchImpact =
  | "POSITIVE"
  | "NEGATIVE"
  | "NEUTRAL"
  | "MIXED"
  | "UNKNOWN"

type ResearchEvidence = {
  id: string
  label: string
  value: string
  unit: string | null
  evidenceDate: string | null
  sourceUrl: string | null
}

type ResearchItem = {
  id: string
  symbol: string
  title: string
  summary: string
  category: ResearchCategory
  impact: ResearchImpact
  sourceType: string
  sourceName: string
  sourceUrl: string | null
  publishedAt: string | null
  fetchedAt: string
  evidence: ResearchEvidence[]
  warnings: string[]
  createdAt: string
}

type ResearchSnapshot = {
  id: string
  symbol: string
  asOf: string
  latestEvidenceAt: string | null
  hasFreshEvidence: boolean
  staleReason: string | null
  positiveCount: number
  negativeCount: number
  neutralCount: number
  riskFlags: string[]
  summary: string
  warnings: string[]
  createdAt: string
}

type ResearchDataQuality = {
  status: "fresh" | "stale" | "missing" | "user-provided" | "official"
  latestEvidenceAt: string | null
  staleReason: string | null
  hasUserProvidedEvidence: boolean
  hasOfficialSource: boolean
  warnings: string[]
}

type SymbolResearchResponse = {
  symbol: string
  researchSnapshot: ResearchSnapshot | null
  items: ResearchItem[]
  warnings: string[]
  dataQuality: ResearchDataQuality
}

const CATEGORIES: ResearchCategory[] = [
  "RESULT",
  "ORDER_WIN",
  "CORPORATE_ACTION",
  "REGULATORY",
  "MANAGEMENT_COMMENTARY",
  "SECTOR_NEWS",
  "COMPANY_NEWS",
  "USER_NOTE",
  "RISK_FLAG",
  "OTHER",
]

const IMPACTS: ResearchImpact[] = [
  "POSITIVE",
  "NEGATIVE",
  "NEUTRAL",
  "MIXED",
  "UNKNOWN",
]

const emptyForm = {
  title: "",
  summary: "",
  category: "USER_NOTE" as ResearchCategory,
  impact: "NEUTRAL" as ResearchImpact,
  sourceName: "",
  sourceUrl: "",
  publishedDate: "",
}

function qualityVariant(status: ResearchDataQuality["status"]) {
  if (status === "fresh" || status === "official") {
    return "default" as const
  }

  if (status === "user-provided") {
    return "secondary" as const
  }

  if (status === "stale") {
    return "outline" as const
  }

  return "destructive" as const
}

export function ResearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeSymbol = searchParams.get("symbol")?.trim().toUpperCase() ?? ""
  const [symbolInput, setSymbolInput] = useState(activeSymbol)
  const [form, setForm] = useState(emptyForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isRefreshingSnapshot, setIsRefreshingSnapshot] = useState(false)

  const researchPath = activeSymbol
    ? `/research/${encodeURIComponent(activeSymbol)}`
    : ""
  const researchQuery = useApiQuery<SymbolResearchResponse>(researchPath)

  const items = researchQuery.data?.items ?? []
  const snapshot = researchQuery.data?.researchSnapshot
  const dataQuality = researchQuery.data?.dataQuality
  const warnings = useMemo(
    () => [
      ...new Set([
        ...(researchQuery.data?.warnings ?? []),
        ...(dataQuality?.warnings ?? []),
      ]),
    ],
    [researchQuery.data?.warnings, dataQuality?.warnings],
  )

  function loadSymbol(event?: FormEvent) {
    event?.preventDefault()
    const symbol = symbolInput.trim().toUpperCase()

    if (!symbol) {
      return
    }

    setSearchParams({ symbol })
  }

  async function refreshSnapshot() {
    if (!activeSymbol) {
      return
    }

    setIsRefreshingSnapshot(true)

    try {
      await apiPostJson(
        `/research/${encodeURIComponent(activeSymbol)}/snapshot`,
        {},
      )
      await researchQuery.refetch()
    } finally {
      setIsRefreshingSnapshot(false)
    }
  }

  async function submitItem(event: FormEvent) {
    event.preventDefault()
    setFormError(null)

    if (!activeSymbol) {
      setFormError("Load a symbol before adding research.")
      return
    }

    setIsSaving(true)

    try {
      await apiPostJson("/research/items", {
        symbol: activeSymbol,
        title: form.title.trim(),
        summary: form.summary.trim(),
        category: form.category,
        impact: form.impact,
        sourceType: "USER_URL",
        sourceName: form.sourceName.trim() || "User",
        sourceUrl: form.sourceUrl.trim() || null,
        publishedAt: form.publishedDate
          ? new Date(`${form.publishedDate}T00:00:00.000Z`).toISOString()
          : null,
      })
      setForm(emptyForm)
      await researchQuery.refetch()
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Failed to save research item",
      )
    } finally {
      setIsSaving(false)
    }
  }

  async function deleteItem(itemId: string) {
    await apiDelete(`/research/items/${itemId}`)
    await researchQuery.refetch()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Research</h1>
          <p className="text-sm text-muted-foreground">
            Store dated company evidence for scanner visibility. Research-only —
            no automated trading.
          </p>
        </div>
        <Badge variant="secondary" className="gap-1">
          <BookOpenText className="size-3.5" />
          User evidence
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Symbol lookup</CardTitle>
          <CardDescription>
            Enter a symbol to view stored evidence and data quality.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(event) => loadSymbol(event)}
          >
            <div className="min-w-[12rem] flex-1 space-y-1">
              <Label htmlFor="research-symbol">Symbol</Label>
              <Input
                id="research-symbol"
                value={symbolInput || activeSymbol}
                onChange={(event) => setSymbolInput(event.target.value.toUpperCase())}
                placeholder="INFY"
              />
            </div>
            <Button type="submit">Load research</Button>
            {activeSymbol ? (
              <Button
                type="button"
                variant="outline"
                disabled={isRefreshingSnapshot}
                onClick={() => void refreshSnapshot()}
              >
                <RefreshCw className="mr-2 size-4" />
                {isRefreshingSnapshot ? "Refreshing…" : "Regenerate snapshot"}
              </Button>
            ) : null}
          </form>
        </CardContent>
      </Card>

      {!activeSymbol ? (
        <EmptyState message="Enter a symbol to view research evidence." />
      ) : researchQuery.isLoading ? (
        <LoadingState message={`Loading research for ${activeSymbol}`} />
      ) : researchQuery.error ? (
        <ErrorState message={researchQuery.error} />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Latest snapshot</CardTitle>
                <CardDescription>
                  Deterministic summary from stored items only.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {snapshot ? (
                  <>
                    <p>{snapshot.summary}</p>
                    <dl className="grid grid-cols-2 gap-2">
                      <div>
                        <dt className="text-muted-foreground">As of</dt>
                        <dd>{formatDateTime(snapshot.asOf)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Latest evidence</dt>
                        <dd>
                          {snapshot.latestEvidenceAt
                            ? formatDateTime(snapshot.latestEvidenceAt)
                            : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Impact mix</dt>
                        <dd>
                          +{snapshot.positiveCount} / -{snapshot.negativeCount} / ~
                          {snapshot.neutralCount}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Fresh evidence</dt>
                        <dd>{snapshot.hasFreshEvidence ? "Yes" : "No"}</dd>
                      </div>
                    </dl>
                    {snapshot.riskFlags.length > 0 ? (
                      <div className="space-y-1">
                        <p className="font-medium">Risk flags</p>
                        <div className="flex flex-wrap gap-1">
                          {snapshot.riskFlags.map((flag) => (
                            <Badge key={flag} variant="destructive">
                              {flag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <EmptyState message="No snapshot yet. Add items or regenerate snapshot." />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Data quality</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {dataQuality ? (
                  <>
                    <Badge variant={qualityVariant(dataQuality.status)}>
                      {dataQuality.status}
                    </Badge>
                    <dl className="grid grid-cols-1 gap-2">
                      <div>
                        <dt className="text-muted-foreground">User-provided</dt>
                        <dd>
                          {dataQuality.hasUserProvidedEvidence ? "Yes" : "No"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Official source</dt>
                        <dd>{dataQuality.hasOfficialSource ? "Yes" : "No"}</dd>
                      </div>
                      {dataQuality.staleReason ? (
                        <div>
                          <dt className="text-muted-foreground">Stale reason</dt>
                          <dd>{dataQuality.staleReason}</dd>
                        </div>
                      ) : null}
                    </dl>
                  </>
                ) : null}
                {warnings.length > 0 ? (
                  <div className="space-y-1">
                    <p className="font-medium">Warnings</p>
                    <div className="flex flex-wrap gap-1">
                      {warnings.map((warning) => (
                        <Badge key={warning} variant="outline">
                          {warning}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground">No warnings.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Research items</CardTitle>
              <CardDescription>
                {items.length} item(s) for {activeSymbol}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {items.length === 0 ? (
                <EmptyState message="No research items yet for this symbol." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Impact</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Published</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="font-medium">{item.title}</div>
                          <div className="line-clamp-2 text-xs text-muted-foreground">
                            {item.summary}
                          </div>
                          {item.warnings.length > 0 ? (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {item.warnings.map((warning) => (
                                <Badge key={warning} variant="outline" className="text-[10px]">
                                  {warning}
                                </Badge>
                              ))}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell>{item.category}</TableCell>
                        <TableCell>{item.impact}</TableCell>
                        <TableCell>
                          <div>{item.sourceName}</div>
                          {item.sourceUrl ? (
                            <a
                              href={item.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-primary underline"
                            >
                              source
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              no URL
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {item.publishedAt
                            ? formatDateTime(item.publishedAt)
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label="Delete research item"
                            onClick={() => void deleteItem(item.id)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Add research item</CardTitle>
              <CardDescription>
                Manual URL/title/summary evidence. No AI-generated facts.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={(event) => void submitItem(event)}>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1 md:col-span-2">
                    <Label htmlFor="research-title">Title</Label>
                    <Input
                      id="research-title"
                      value={form.title}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          title: event.target.value,
                        }))
                      }
                      required
                    />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label htmlFor="research-summary">Summary</Label>
                    <Textarea
                      id="research-summary"
                      value={form.summary}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          summary: event.target.value,
                        }))
                      }
                      rows={4}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Category</Label>
                    <Select
                      value={form.category}
                      onValueChange={(value) =>
                        setForm((current) => ({
                          ...current,
                          category: value as ResearchCategory,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((category) => (
                          <SelectItem key={category} value={category}>
                            {category}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Impact</Label>
                    <Select
                      value={form.impact}
                      onValueChange={(value) =>
                        setForm((current) => ({
                          ...current,
                          impact: value as ResearchImpact,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {IMPACTS.map((impact) => (
                          <SelectItem key={impact} value={impact}>
                            {impact}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="research-source-name">Source name</Label>
                    <Input
                      id="research-source-name"
                      value={form.sourceName}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          sourceName: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="research-source-url">Source URL</Label>
                    <Input
                      id="research-source-url"
                      type="url"
                      value={form.sourceUrl}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          sourceUrl: event.target.value,
                        }))
                      }
                      placeholder="https://"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="research-published">Published date</Label>
                    <Input
                      id="research-published"
                      type="date"
                      value={form.publishedDate}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          publishedDate: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
                {formError ? (
                  <p className="text-sm text-destructive">{formError}</p>
                ) : null}
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? "Saving…" : "Add research item"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

export function ResearchSymbolLink({ symbol }: { symbol: string }) {
  return (
    <Link
      to={`/research?symbol=${encodeURIComponent(symbol)}`}
      className="text-sm text-primary underline"
    >
      Open research for {symbol}
    </Link>
  )
}
