import { type FormEvent, useMemo, useState } from "react"
import { ClipboardList, Plus, Trash2 } from "lucide-react"
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
import {
  apiDelete,
  apiPatchJson,
  apiPostJson,
  buildQuery,
} from "@/lib/api-client"
import { formatDateTime, formatMoney } from "@/lib/format"
import { useApiQuery } from "@/lib/use-api-query"
import { EmptyState, ErrorState, LoadingState } from "./page-state"

type JournalStatus = "PLANNED" | "ACTIVE" | "CLOSED" | "CANCELLED"

type TradeJournalEntry = {
  id: string
  symbol: string
  side: string
  product: string
  plannedEntry: number
  plannedTarget: number
  plannedStopLoss: number
  quantity: number
  setupType: string | null
  status: JournalStatus
  notes: string | null
  source: "MANUAL" | "FROM_SCANNER"
  swingScanRunId: string | null
  scannerCandidateKey: string | null
  validationSnapshot: {
    valid?: boolean
    warnings?: string[]
    rejectReasons?: string[]
  } | null
  exitPrice: number | null
  exitAt: string | null
  actualPnl: number | null
  exitReason: string | null
  mistakeTags: string[]
  lessonLearned: string | null
  closedAt: string | null
  createdAt: string
  updatedAt: string
}

type EntriesResponse = {
  entries: TradeJournalEntry[]
  disclaimer: string
}

const STATUS_OPTIONS: JournalStatus[] = [
  "PLANNED",
  "ACTIVE",
  "CLOSED",
  "CANCELLED",
]

const emptyPlanForm = {
  symbol: "",
  plannedEntry: "",
  plannedTarget: "",
  plannedStopLoss: "",
  quantity: "",
  setupType: "",
  notes: "",
}

const emptyCloseForm = {
  exitPrice: "",
  exitReason: "",
  mistakeTags: "",
  lessonLearned: "",
}

function statusVariant(status: JournalStatus) {
  if (status === "PLANNED") {
    return "secondary" as const
  }

  if (status === "ACTIVE") {
    return "default" as const
  }

  if (status === "CLOSED") {
    return "outline" as const
  }

  return "destructive" as const
}

function pickDefaultEntryId(entries: TradeJournalEntry[]) {
  return entries[0]?.id ?? null
}

export function TradeJournalPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [symbolFilter, setSymbolFilter] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [planForm, setPlanForm] = useState(emptyPlanForm)
  const [closeForm, setCloseForm] = useState(emptyCloseForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const listPath = useMemo(
    () =>
      `/trade-journal/entries${buildQuery({
        status: statusFilter === "all" ? undefined : statusFilter,
        symbol: symbolFilter.trim() || undefined,
      })}`,
    [statusFilter, symbolFilter],
  )

  const entriesQuery = useApiQuery<EntriesResponse>(listPath)
  const entries = useMemo(
    () => entriesQuery.data?.entries ?? [],
    [entriesQuery.data?.entries],
  )

  const effectiveSelectedId = useMemo(() => {
    if (entries.length === 0) {
      return null
    }

    if (selectedId && entries.some((entry) => entry.id === selectedId)) {
      return selectedId
    }

    return pickDefaultEntryId(entries)
  }, [entries, selectedId])

  const selectedEntry = useMemo(() => {
    if (!effectiveSelectedId) {
      return null
    }

    return entries.find((entry) => entry.id === effectiveSelectedId) ?? null
  }, [entries, effectiveSelectedId])

  const disclaimer =
    entriesQuery.data?.disclaimer ??
    "Journal only — does not place orders. Verify and execute manually in Dhan."

  async function reloadEntries(preferredId?: string | null) {
    const data = await entriesQuery.refetch()
    const nextEntries = data?.entries ?? []
    const nextId =
      preferredId && nextEntries.some((entry) => entry.id === preferredId)
        ? preferredId
        : pickDefaultEntryId(nextEntries)

    setSelectedId(nextId)
    return data
  }

  async function createPlan(event: FormEvent) {
    event.preventDefault()
    setFormError(null)
    setActionMessage(null)
    setIsSaving(true)

    try {
      const result = await apiPostJson<{ entry: TradeJournalEntry }>(
        "/trade-journal/entries",
        {
          symbol: planForm.symbol.trim().toUpperCase(),
          side: "BUY",
          product: "DELIVERY",
          plannedEntry: Number(planForm.plannedEntry),
          plannedTarget: Number(planForm.plannedTarget),
          plannedStopLoss: Number(planForm.plannedStopLoss),
          quantity: Number(planForm.quantity),
          setupType: planForm.setupType.trim() || null,
          notes: planForm.notes.trim() || null,
        },
      )
      setPlanForm(emptyPlanForm)
      await reloadEntries(result.entry.id)
      setActionMessage(`Created plan for ${result.entry.symbol}.`)
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Unable to create journal entry.",
      )
    } finally {
      setIsSaving(false)
    }
  }

  async function closeTrade(event: FormEvent) {
    event.preventDefault()
    if (!selectedEntry?.id) {
      return
    }

    const entryId = selectedEntry.id
    setFormError(null)
    setActionMessage(null)
    setIsSaving(true)

    try {
      await apiPatchJson(`/trade-journal/entries/${entryId}`, {
        status: "CLOSED",
        exitPrice: Number(closeForm.exitPrice),
        exitReason: closeForm.exitReason.trim() || null,
        mistakeTags: closeForm.mistakeTags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        lessonLearned: closeForm.lessonLearned.trim() || null,
      })
      setCloseForm(emptyCloseForm)
      await reloadEntries()
      setActionMessage("Trade closed and review saved.")
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Unable to close journal entry.",
      )
    } finally {
      setIsSaving(false)
    }
  }

  async function cancelEntry() {
    if (!selectedEntry?.id) {
      return
    }

    const entryId = selectedEntry.id
    setFormError(null)
    setActionMessage(null)
    setIsSaving(true)

    try {
      await apiPatchJson(`/trade-journal/entries/${entryId}`, {
        status: "CANCELLED",
      })
      const data = await reloadEntries()
      const stillVisible = data?.entries.some((entry) => entry.id === entryId)
      setActionMessage(
        stillVisible
          ? "Plan cancelled."
          : "Plan cancelled. It is hidden by the current status filter — choose All statuses or Cancelled to view it.",
      )
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Unable to cancel journal entry.",
      )
    } finally {
      setIsSaving(false)
    }
  }

  async function deleteEntry() {
    if (!selectedEntry?.id) {
      return
    }

    const entryId = selectedEntry.id
    setFormError(null)
    setActionMessage(null)
    setIsSaving(true)

    try {
      await apiDelete(`/trade-journal/entries/${entryId}`)
      await reloadEntries()
      setActionMessage("Journal entry deleted.")
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Unable to delete journal entry.",
      )
    } finally {
      setIsSaving(false)
    }
  }

  const actionsDisabled = isSaving || entriesQuery.isLoading

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <ClipboardList className="size-5 text-muted-foreground" />
            <CardTitle>Trade Journal</CardTitle>
          </div>
          <CardDescription>
            Manual trade plans and post-trade reviews. This module does not place
            or modify broker orders.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
            {disclaimer}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader className="space-y-3">
            <CardTitle className="text-base">Journal entries</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value)
                  setSelectedId(null)
                  setFormError(null)
                  setActionMessage(null)
                }}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {STATUS_OPTIONS.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                className="max-w-[180px]"
                placeholder="Symbol filter"
                value={symbolFilter}
                onChange={(event) => {
                  setSymbolFilter(event.target.value)
                  setSelectedId(null)
                }}
              />
            </div>
          </CardHeader>
          <CardContent>
            {entriesQuery.isLoading && entries.length === 0 ? (
              <LoadingState message="Loading journal entries" />
            ) : null}
            {entriesQuery.error ? (
              <ErrorState message={entriesQuery.error} />
            ) : null}
            {!entriesQuery.isLoading && entries.length === 0 ? (
              <EmptyState message="No journal entries yet. Create a manual plan below." />
            ) : null}
            {entries.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Setup</TableHead>
                    <TableHead>Entry</TableHead>
                    <TableHead>SL</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow
                      key={entry.id}
                      className={
                        effectiveSelectedId === entry.id
                          ? "bg-muted/50 cursor-pointer"
                          : "cursor-pointer"
                      }
                      onClick={() => {
                        setSelectedId(entry.id)
                        setFormError(null)
                        setActionMessage(null)
                      }}
                    >
                      <TableCell className="font-medium">{entry.symbol}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(entry.status)}>
                          {entry.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{entry.setupType ?? "—"}</TableCell>
                      <TableCell>{formatMoney(entry.plannedEntry)}</TableCell>
                      <TableCell>{formatMoney(entry.plannedStopLoss)}</TableCell>
                      <TableCell>{formatMoney(entry.plannedTarget)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateTime(entry.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Entry detail</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {entriesQuery.isLoading && !selectedEntry ? (
              <LoadingState message="Refreshing entry" />
            ) : null}
            {!entriesQuery.isLoading && !selectedEntry ? (
              <p className="text-muted-foreground">
                Select an entry from the table or create a new plan.
              </p>
            ) : null}
            {selectedEntry ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={statusVariant(selectedEntry.status)}>
                    {selectedEntry.status}
                  </Badge>
                  <Badge variant="outline">{selectedEntry.source}</Badge>
                  {selectedEntry.setupType ? (
                    <Badge variant="outline">{selectedEntry.setupType}</Badge>
                  ) : null}
                </div>
                <dl className="grid grid-cols-2 gap-2">
                  <div>
                    <dt className="text-muted-foreground">Qty</dt>
                    <dd>{selectedEntry.quantity}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Product</dt>
                    <dd>{selectedEntry.product}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Entry</dt>
                    <dd>{formatMoney(selectedEntry.plannedEntry)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Stop loss</dt>
                    <dd>{formatMoney(selectedEntry.plannedStopLoss)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Target</dt>
                    <dd>{formatMoney(selectedEntry.plannedTarget)}</dd>
                  </div>
                  {selectedEntry.actualPnl !== null ? (
                    <div>
                      <dt className="text-muted-foreground">Actual P&L</dt>
                      <dd>{formatMoney(selectedEntry.actualPnl)}</dd>
                    </div>
                  ) : null}
                </dl>
                {selectedEntry.notes ? <p>{selectedEntry.notes}</p> : null}
                {selectedEntry.validationSnapshot?.rejectReasons?.length ? (
                  <div className="space-y-1">
                    <p className="font-medium text-destructive">Risk rejects at plan</p>
                    <div className="flex flex-wrap gap-1">
                      {selectedEntry.validationSnapshot.rejectReasons.map(
                        (reason) => (
                          <Badge key={reason} variant="destructive">
                            {reason}
                          </Badge>
                        ),
                      )}
                    </div>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {selectedEntry.status === "PLANNED" ||
                  selectedEntry.status === "CANCELLED" ? (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={actionsDisabled}
                      onClick={() => void deleteEntry()}
                    >
                      <Trash2 className="mr-2 size-4" />
                      Delete
                    </Button>
                  ) : null}
                  {selectedEntry.status === "PLANNED" ||
                  selectedEntry.status === "ACTIVE" ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={actionsDisabled}
                      onClick={() => void cancelEntry()}
                    >
                      Cancel plan
                    </Button>
                  ) : null}
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Plus className="size-4" />
              New manual plan
            </CardTitle>
            <CardDescription>DELIVERY BUY plans only in v1.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={createPlan}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="plan-symbol">Symbol</Label>
                  <Input
                    id="plan-symbol"
                    value={planForm.symbol}
                    onChange={(event) =>
                      setPlanForm((current) => ({
                        ...current,
                        symbol: event.target.value,
                      }))
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plan-setup">Setup type</Label>
                  <Input
                    id="plan-setup"
                    value={planForm.setupType}
                    onChange={(event) =>
                      setPlanForm((current) => ({
                        ...current,
                        setupType: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plan-entry">Planned entry</Label>
                  <Input
                    id="plan-entry"
                    type="number"
                    step="0.01"
                    value={planForm.plannedEntry}
                    onChange={(event) =>
                      setPlanForm((current) => ({
                        ...current,
                        plannedEntry: event.target.value,
                      }))
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plan-sl">Stop loss</Label>
                  <Input
                    id="plan-sl"
                    type="number"
                    step="0.01"
                    value={planForm.plannedStopLoss}
                    onChange={(event) =>
                      setPlanForm((current) => ({
                        ...current,
                        plannedStopLoss: event.target.value,
                      }))
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plan-target">Target</Label>
                  <Input
                    id="plan-target"
                    type="number"
                    step="0.01"
                    value={planForm.plannedTarget}
                    onChange={(event) =>
                      setPlanForm((current) => ({
                        ...current,
                        plannedTarget: event.target.value,
                      }))
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plan-qty">Quantity</Label>
                  <Input
                    id="plan-qty"
                    type="number"
                    min={1}
                    value={planForm.quantity}
                    onChange={(event) =>
                      setPlanForm((current) => ({
                        ...current,
                        quantity: event.target.value,
                      }))
                    }
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="plan-notes">Notes</Label>
                <Textarea
                  id="plan-notes"
                  value={planForm.notes}
                  onChange={(event) =>
                    setPlanForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                />
              </div>
              <Button type="submit" disabled={actionsDisabled}>
                {isSaving ? "Saving…" : "Create plan"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Close trade / review</CardTitle>
            <CardDescription>
              Required for PLANNED or ACTIVE entries before archiving performance.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedEntry ||
            (selectedEntry.status !== "PLANNED" &&
              selectedEntry.status !== "ACTIVE") ? (
              <p className="text-sm text-muted-foreground">
                Select a planned or active entry to record exit and lessons.
              </p>
            ) : (
              <form className="space-y-3" onSubmit={closeTrade}>
                <div className="space-y-2">
                  <Label htmlFor="exit-price">Exit price</Label>
                  <Input
                    id="exit-price"
                    type="number"
                    step="0.01"
                    value={closeForm.exitPrice}
                    onChange={(event) =>
                      setCloseForm((current) => ({
                        ...current,
                        exitPrice: event.target.value,
                      }))
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="exit-reason">Exit reason</Label>
                  <Textarea
                    id="exit-reason"
                    value={closeForm.exitReason}
                    onChange={(event) =>
                      setCloseForm((current) => ({
                        ...current,
                        exitReason: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mistake-tags">Mistake tags (comma-separated)</Label>
                  <Input
                    id="mistake-tags"
                    value={closeForm.mistakeTags}
                    onChange={(event) =>
                      setCloseForm((current) => ({
                        ...current,
                        mistakeTags: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lesson">Lesson learned</Label>
                  <Textarea
                    id="lesson"
                    value={closeForm.lessonLearned}
                    onChange={(event) =>
                      setCloseForm((current) => ({
                        ...current,
                        lessonLearned: event.target.value,
                      }))
                    }
                  />
                </div>
                <Button type="submit" disabled={actionsDisabled}>
                  {isSaving ? "Closing…" : "Close trade"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>

      {actionMessage ? (
        <p className="text-sm text-muted-foreground">{actionMessage}</p>
      ) : null}
      {formError ? <ErrorState message={formError} /> : null}
    </div>
  )
}
