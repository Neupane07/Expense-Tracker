import { type FormEvent, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { ClipboardList, Play, ScanSearch } from "lucide-react"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { apiGet, apiPostJson } from "@/lib/api-client"
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format"
import { useApiQuery } from "@/lib/use-api-query"
import {
  DataQualityBadges,
  ReadinessStatusBadge,
  RejectReasonList,
  ResearchDisclaimer,
  WarningsList,
} from "@/components/finance/finance-quality"
import { EmptyState, ErrorState, LoadingState } from "./page-state"

type SwingCandidate = {
  symbol: string
  name: string
  setupType: string
  entryZone: { low: number; high: number }
  entry: number
  target: number
  stopLoss: number
  riskReward: number
  suggestedQuantity: number
  capitalRequired: number
  maxRiskAmount: number
  targetProfitAmount: number
  confidenceScore: number
  confidenceCapReason: string | null
  technicalSummary: string
  portfolioFit: {
    alreadyHeld: boolean
    exposureBeforePct: number
    exposureAfterPct: number
    warnings: string[]
  }
  rejectReasons: string[]
  warnings: string[]
  dataQuality: {
    priceSource: string | null
    priceTimestamp: string | null
    technicalSource: string | null
    freshness: string
    confidence: string
    warnings: string[]
  }
  status: "candidate" | "rejected" | "watchlist"
  researchDisclaimer: string
  researchFreshness: "fresh" | "stale" | "missing"
  latestResearchAt: string | null
  researchWarnings: string[]
  evidenceCount: number
  riskFlags: string[]
}

type SwingScanRunResponse = {
  runId: string
  runAt: string
  universeSource: string
  universe: string[]
  candidateCount: number
  candidates: SwingCandidate[]
  warnings: string[]
  researchDisclaimer: string
}

type SwingCandidatesResponse = {
  run: {
    id: string
    runAt: string
    universeSource: string
    universe: string[]
    candidateCount: number
    warnings: string[]
  } | null
  candidates: SwingCandidate[]
  researchDisclaimer: string
}

type ScannerReadinessResponse = {
  status: "READY" | "DEGRADED" | "BLOCKED"
  universe: string[]
  universeSource: "holdings" | "symbols"
  warnings: string[]
  blockers: string[]
  checks: Array<{
    id: string
    label: string
    status: "READY" | "DEGRADED" | "BLOCKED"
    warnings: string[]
    blockers: string[]
  }>
  researchDisclaimer: string
}

function statusVariant(status: SwingCandidate["status"]) {
  if (status === "candidate") {
    return "default" as const
  }

  if (status === "watchlist") {
    return "secondary" as const
  }

  return "destructive" as const
}

function freshnessVariant(freshness: string) {
  if (freshness === "LIVE") {
    return "default" as const
  }

  if (freshness === "RECENT") {
    return "secondary" as const
  }

  return "outline" as const
}

export function SwingScannerPage() {
  const [symbolInput, setSymbolInput] = useState("")
  const [readinessSymbols, setReadinessSymbols] = useState<string[]>([])
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [lastRun, setLastRun] = useState<SwingScanRunResponse | null>(null)
  const [journalMessage, setJournalMessage] = useState<string | null>(null)
  const [isSavingJournal, setIsSavingJournal] = useState(false)

  const readinessPath = useMemo(() => {
    if (readinessSymbols.length > 0) {
      return `/scanner/readiness?symbols=${encodeURIComponent(readinessSymbols.join(","))}`
    }

    return "/scanner/readiness"
  }, [readinessSymbols])

  const candidatesQuery = useApiQuery<SwingCandidatesResponse>(
    "/scanner/swing/candidates",
  )
  const readinessQuery = useApiQuery<ScannerReadinessResponse>(readinessPath)

  const explicitSymbols = useMemo(
    () =>
      symbolInput
        .split(/[,\s]+/)
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean),
    [symbolInput],
  )

  const readinessAppliesToSubmitUniverse = useMemo(() => {
    if (explicitSymbols.length > 0) {
      return (
        readinessSymbols.length > 0 &&
        readinessSymbols.join(",") === explicitSymbols.join(",")
      )
    }

    return readinessSymbols.length === 0
  }, [explicitSymbols, readinessSymbols])

  const scanBlocked =
    readinessAppliesToSubmitUniverse &&
    readinessQuery.data?.status === "BLOCKED"

  const candidates = useMemo(
    () => lastRun?.candidates ?? candidatesQuery.data?.candidates ?? [],
    [lastRun?.candidates, candidatesQuery.data?.candidates],
  )
  const runMeta = lastRun
    ? {
        runAt: lastRun.runAt,
        universeSource: lastRun.universeSource,
        universe: lastRun.universe,
        warnings: lastRun.warnings,
      }
    : candidatesQuery.data?.run

  const selectedCandidate = useMemo(() => {
    if (selectedKey) {
      const [symbol, setupType] = selectedKey.split("::")
      const match = candidates.find(
        (candidate) =>
          candidate.symbol === symbol && candidate.setupType === setupType,
      )
      if (match) {
        return match
      }
    }

    return candidates[0] ?? null
  }, [candidates, selectedKey])

  async function saveToJournal() {
    if (!selectedCandidate || isSavingJournal) {
      return
    }

    setJournalMessage(null)
    setIsSavingJournal(true)

    try {
      const result = await apiPostJson<{ entry: { id: string; symbol: string } }>(
        "/trade-journal/entries/from-scanner-candidate",
        {
          symbol: selectedCandidate.symbol,
          setupType: selectedCandidate.setupType,
          swingScanRunId: lastRun?.runId ?? candidatesQuery.data?.run?.id,
        },
      )
      setJournalMessage(
        `Saved ${result.entry.symbol} to trade journal. Open Trade Journal to review or delete the plan.`,
      )
    } catch (error) {
      setJournalMessage(
        error instanceof Error
          ? error.message
          : "Unable to save candidate to trade journal.",
      )
    } finally {
      setIsSavingJournal(false)
    }
  }

  async function runScan(event: FormEvent) {
    event.preventDefault()
    setScanError(null)
    setIsRunning(true)

    try {
      const symbols = symbolInput
        .split(/[,\s]+/)
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean)
      setReadinessSymbols(symbols)

      const readinessPathForRun =
        symbols.length > 0
          ? `/scanner/readiness?symbols=${encodeURIComponent(symbols.join(","))}`
          : "/scanner/readiness"
      const readiness = await apiGet<ScannerReadinessResponse>(readinessPathForRun)

      if (readiness.status === "BLOCKED") {
        setScanError(
          `Scanner blocked: ${readiness.blockers.join(", ") || "readiness checks failed"}`,
        )
        return
      }

      const payload =
        symbols.length > 0 ? { symbols, universe: "symbols" as const } : {}

      const result = await apiPostJson<SwingScanRunResponse>(
        "/scanner/swing/run",
        payload,
      )
      setLastRun(result)
      if (result.candidates[0]) {
        setSelectedKey(
          `${result.candidates[0].symbol}::${result.candidates[0].setupType}`,
        )
      }
    } catch (error) {
      setScanError(
        error instanceof Error ? error.message : "Swing scan failed.",
      )
    } finally {
      setIsRunning(false)
    }
  }

  const disclaimer =
    lastRun?.researchDisclaimer ??
    candidatesQuery.data?.researchDisclaimer ??
    readinessQuery.data?.researchDisclaimer

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <ScanSearch className="size-5 text-muted-foreground" />
            <CardTitle>Swing Scanner</CardTitle>
          </div>
          <CardDescription>
            Research-only swing setup scan using verified market data, portfolio
            exposure, and deterministic risk rules. Results are not orders.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ResearchDisclaimer text={disclaimer} />

          {readinessQuery.data ? (
            <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">Scanner readiness</span>
                <ReadinessStatusBadge status={readinessQuery.data.status} />
                <Badge variant="outline">
                  {readinessQuery.data.universeSource} ·{" "}
                  {readinessQuery.data.universe.length} symbols
                </Badge>
              </div>
              <WarningsList warnings={readinessQuery.data.warnings} />
              <RejectReasonList reasons={readinessQuery.data.blockers} />
            </div>
          ) : readinessQuery.isLoading ? (
            <LoadingState message="Checking scanner readiness" />
          ) : null}

          <form className="grid gap-3 md:grid-cols-[1fr_auto]" onSubmit={runScan}>
            <div className="space-y-2">
              <Label htmlFor="scan-symbols">
                Symbols (optional, comma-separated)
              </Label>
              <Input
                id="scan-symbols"
                placeholder="Leave empty to scan synced holdings"
                value={symbolInput}
                onChange={(event) => setSymbolInput(event.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={isRunning || scanBlocked}>
                <Play className="mr-2 size-4" />
                {isRunning
                  ? "Running scan…"
                  : scanBlocked
                    ? "Scan blocked"
                    : "Run scan"}
              </Button>
            </div>
          </form>

          {scanBlocked ? (
            <p className="text-sm text-destructive">
              Scanner readiness is blocked for the current universe. Resolve blockers
              above before running a scan.
            </p>
          ) : null}

          {scanError ? <ErrorState message={scanError} /> : null}
          {runMeta ? (
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>Last run: {formatDateTime(runMeta.runAt)}</span>
              <span>Universe: {runMeta.universeSource}</span>
              <span>{runMeta.universe.length} symbols</span>
              {runMeta.warnings.map((warning) => (
                <Badge key={warning} variant="outline">
                  {warning}
                </Badge>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Scan results</CardTitle>
            <CardDescription>
              Backend-generated candidates with reject reasons and data-quality
              metadata.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {candidatesQuery.isLoading && !lastRun ? (
              <LoadingState message="Loading latest scan" />
            ) : null}
            {candidatesQuery.error && !lastRun ? (
              <ErrorState message={candidatesQuery.error} />
            ) : null}
            {!candidatesQuery.isLoading && candidates.length === 0 ? (
              <EmptyState message="No scan results yet. Run a scan on synced holdings or enter symbols to research setups." />
            ) : null}
            {candidates.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Setup</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>R:R</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {candidates.map((candidate) => (
                    <TableRow
                      key={`${candidate.symbol}-${candidate.setupType}`}
                      className={
                        selectedCandidate?.symbol === candidate.symbol &&
                        selectedCandidate?.setupType === candidate.setupType
                          ? "bg-muted/50 cursor-pointer"
                          : "cursor-pointer"
                      }
                      onClick={() =>
                        setSelectedKey(`${candidate.symbol}::${candidate.setupType}`)
                      }
                    >
                      <TableCell className="font-medium">
                        {candidate.symbol}
                        <div className="text-xs text-muted-foreground">
                          {candidate.name}
                        </div>
                      </TableCell>
                      <TableCell>{candidate.setupType}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(candidate.status)}>
                          {candidate.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatNumber(candidate.riskReward)}</TableCell>
                      <TableCell>{candidate.suggestedQuantity}</TableCell>
                      <TableCell>{formatNumber(candidate.confidenceScore)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={freshnessVariant(candidate.dataQuality.freshness)}
                        >
                          {candidate.dataQuality.freshness}
                        </Badge>
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
            <CardTitle className="text-base">Candidate detail</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {!selectedCandidate ? (
              <p className="text-muted-foreground">Select a row to inspect.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  <Badge>{selectedCandidate.setupType}</Badge>
                  <Badge variant={statusVariant(selectedCandidate.status)}>
                    {selectedCandidate.status}
                  </Badge>
                  {selectedCandidate.confidenceCapReason ? (
                    <Badge variant="outline">
                      cap: {selectedCandidate.confidenceCapReason}
                    </Badge>
                  ) : null}
                </div>
                <p>{selectedCandidate.technicalSummary}</p>
                <dl className="grid grid-cols-2 gap-2">
                  <div>
                    <dt className="text-muted-foreground">Entry zone</dt>
                    <dd>
                      {formatMoney(selectedCandidate.entryZone.low)} –{" "}
                      {formatMoney(selectedCandidate.entryZone.high)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Entry</dt>
                    <dd>{formatMoney(selectedCandidate.entry)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Target</dt>
                    <dd>{formatMoney(selectedCandidate.target)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Stop loss</dt>
                    <dd>{formatMoney(selectedCandidate.stopLoss)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Capital</dt>
                    <dd>{formatMoney(selectedCandidate.capitalRequired)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Max risk</dt>
                    <dd>{formatMoney(selectedCandidate.maxRiskAmount)}</dd>
                  </div>
                </dl>
                {selectedCandidate.rejectReasons.length > 0 ? (
                  <div className="space-y-1">
                    <p className="font-medium text-destructive">Reject reasons</p>
                    <div className="flex flex-wrap gap-1">
                      {selectedCandidate.rejectReasons.map((reason) => (
                        <Badge key={reason} variant="destructive">
                          {reason}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
                {selectedCandidate.warnings.length > 0 ? (
                  <div className="space-y-1">
                    <p className="font-medium">Warnings</p>
                    <div className="flex flex-wrap gap-1">
                      {selectedCandidate.warnings.map((warning) => (
                        <Badge key={warning} variant="outline">
                          {warning}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="space-y-1">
                  <p className="font-medium">Research status</p>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline">
                      {selectedCandidate.researchFreshness ?? "missing"}
                    </Badge>
                    <Badge variant="outline">
                      evidence: {selectedCandidate.evidenceCount ?? 0}
                    </Badge>
                    {selectedCandidate.latestResearchAt ? (
                      <Badge variant="outline">
                        latest: {formatDateTime(selectedCandidate.latestResearchAt)}
                      </Badge>
                    ) : null}
                  </div>
                  {(selectedCandidate.researchWarnings ?? []).length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {(selectedCandidate.researchWarnings ?? []).map((warning) => (
                        <Badge key={warning} variant="outline">
                          {warning}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  {(selectedCandidate.riskFlags ?? []).length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {(selectedCandidate.riskFlags ?? []).map((flag) => (
                        <Badge key={flag} variant="destructive">
                          {flag}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  <Link
                    to={`/research?symbol=${encodeURIComponent(selectedCandidate.symbol)}`}
                    className="text-sm text-primary underline"
                  >
                    Open research for {selectedCandidate.symbol}
                  </Link>
                </div>
                <div className="space-y-1">
                  <p className="font-medium">Data quality</p>
                  <DataQualityBadges
                    dataQuality={{
                      freshness: selectedCandidate.dataQuality.freshness,
                      confidence: selectedCandidate.dataQuality.confidence,
                      source: selectedCandidate.dataQuality.priceSource ?? undefined,
                    }}
                    warnings={selectedCandidate.dataQuality.warnings}
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={isSavingJournal}
                  onClick={() => void saveToJournal()}
                >
                  <ClipboardList className="mr-2 size-4" />
                  {isSavingJournal ? "Saving…" : "Save to journal"}
                </Button>
                {journalMessage ? (
                  <p className="text-xs text-muted-foreground">{journalMessage}</p>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
