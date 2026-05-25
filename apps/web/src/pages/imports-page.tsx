import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { apiGet, apiPostFormData } from "@/lib/api-client"
import { formatDate, formatMoney } from "@/lib/format"
import { useApiQuery } from "@/lib/use-api-query"
import type {
  Account,
  ImportDetail,
  ImportPreview,
  ImportRecord,
  ImportSummary,
} from "@/pages/types"
import { EmptyState, ErrorState, LoadingState } from "./page-state"

const sourceTypes = [
  { value: "ICICI_BANK", label: "ICICI Bank" },
  { value: "ICICI_AMAZON_PAY_CARD", label: "ICICI Amazon Pay Card" },
]

type ImportResult = ImportSummary & {
  reviewRows: number
}

export function ImportsPage() {
  const [accountId, setAccountId] = useState("")
  const [sourceType, setSourceType] = useState("ICICI_BANK")
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const accountsQuery = useApiQuery<Account[]>("/accounts")
  const importsQuery = useApiQuery<ImportRecord[]>(`/imports?refresh=${refreshKey}`)
  const selectedAccount = useMemo(
    () => accountsQuery.data?.find((account) => account.id === accountId),
    [accountsQuery.data, accountId],
  )
  const canPreview = Boolean(accountId && sourceType && file && !isPreviewing)
  const canConfirm = Boolean(preview && file && !isImporting)

  async function handlePreview() {
    if (!file) {
      return
    }

    setActionError(null)
    setResult(null)
    setIsPreviewing(true)

    try {
      const data = await apiPostFormData<ImportPreview>(
        "/imports/preview",
        buildImportFormData(file, accountId, sourceType),
      )
      setPreview(data)
    } catch (error) {
      setPreview(null)
      setActionError(
        error instanceof Error ? error.message : "Unable to preview statement",
      )
    } finally {
      setIsPreviewing(false)
    }
  }

  async function handleConfirmImport() {
    if (!file) {
      return
    }

    setActionError(null)
    setIsImporting(true)

    try {
      const summary = await apiPostFormData<ImportSummary>(
        "/imports",
        buildImportFormData(file, accountId, sourceType),
      )
      const importDetail = await apiGet<ImportDetail>(`/imports/${summary.importId}`)
      const reviewRows = importDetail.transactions.filter(
        (transaction) => transaction.category?.expenseType === "REVIEW",
      ).length

      setResult({
        ...summary,
        reviewRows,
      })
      setPreview(null)
      setRefreshKey((value) => value + 1)
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Unable to import statement",
      )
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Import statement</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {accountsQuery.error ? (
            <ErrorState message={accountsQuery.error} />
          ) : (
            <div className="grid gap-4 md:grid-cols-[1fr_1fr_1.4fr_auto] md:items-end">
              <div className="space-y-2">
                <Label htmlFor="account">Account</Label>
                <Select
                  value={accountId}
                  onValueChange={(value) => {
                    setAccountId(value)
                    setPreview(null)
                    setResult(null)
                  }}
                  disabled={accountsQuery.isLoading}
                >
                  <SelectTrigger id="account" className="w-full">
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    {(accountsQuery.data ?? []).map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sourceType">Source</Label>
                <Select
                  value={sourceType}
                  onValueChange={(value) => {
                    setSourceType(value)
                    setPreview(null)
                    setResult(null)
                  }}
                >
                  <SelectTrigger id="sourceType" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sourceTypes.map((source) => (
                      <SelectItem key={source.value} value={source.value}>
                        {source.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="statementFile">Statement file</Label>
                <Input
                  id="statementFile"
                  type="file"
                  accept=".csv,.xls,.xlsx"
                  onChange={(event) => {
                    setFile(event.target.files?.[0] ?? null)
                    setPreview(null)
                    setResult(null)
                  }}
                />
              </div>

              <Button onClick={handlePreview} disabled={!canPreview}>
                {isPreviewing ? "Previewing" : "Preview"}
              </Button>
            </div>
          )}

          {selectedAccount ? (
            <p className="text-sm text-muted-foreground">
              Selected account: {selectedAccount.name}
            </p>
          ) : null}

          {actionError ? <ErrorState message={actionError} /> : null}
        </CardContent>
      </Card>

      {preview ? (
        <PreviewPanel
          preview={preview}
          onConfirm={handleConfirmImport}
          isImporting={isImporting}
          canConfirm={canConfirm}
        />
      ) : null}

      {result ? <ImportSummaryPanel result={result} /> : null}

      <RecentImportsPanel query={importsQuery} />
    </div>
  )
}

function PreviewPanel({
  preview,
  onConfirm,
  isImporting,
  canConfirm,
}: {
  preview: ImportPreview
  onConfirm: () => void
  isImporting: boolean
  canConfirm: boolean
}) {
  const visibleRows = preview.rows.slice(0, 25)

  return (
    <Card>
      <CardHeader className="gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle>Preview</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {preview.stats.parsedRows} parsed rows from{" "}
            {preview.stats.totalRowsScanned} scanned rows.
          </p>
        </div>
        <Button onClick={onConfirm} disabled={!canConfirm}>
          {isImporting ? "Importing" : "Confirm Import"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <StatsGrid
          stats={[
            ["Total rows", preview.stats.totalRowsScanned],
            ["Parsed rows", preview.stats.parsedRows],
            ["Skipped rows", preview.stats.skippedRows],
            ["Errors", preview.stats.errors.length],
          ]}
        />

        {preview.stats.errors.length > 0 ? (
          <div className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">
            {preview.stats.errors.slice(0, 3).join(" ")}
          </div>
        ) : null}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Method</TableHead>
              <TableHead className="text-right">Money out</TableHead>
              <TableHead className="text-right">Money in</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead>Reference</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.map((row, index) => (
              <TableRow key={`${row.transactionDate}-${index}`}>
                <TableCell>{row.transactionDate}</TableCell>
                <TableCell className="min-w-72 font-medium">
                  {row.descriptionRaw}
                </TableCell>
                <TableCell>{row.paymentMethod ?? "-"}</TableCell>
                <TableCell className="text-right">
                  {formatMoney(row.moneyOut)}
                </TableCell>
                <TableCell className="text-right">
                  {formatMoney(row.moneyIn)}
                </TableCell>
                <TableCell className="text-right">
                  {row.balance === null ? "-" : formatMoney(row.balance)}
                </TableCell>
                <TableCell>{row.referenceNumber ?? "-"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {preview.rows.length > visibleRows.length ? (
          <p className="text-sm text-muted-foreground">
            Showing first {visibleRows.length} rows.
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

function ImportSummaryPanel({ result }: { result: ImportResult }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Import summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <StatsGrid
          stats={[
            ["Total rows", result.totalRows],
            ["Imported rows", result.importedRows],
            ["Duplicates skipped", result.duplicateRows],
            ["Failed rows", result.failedRows],
            ["Review rows", result.reviewRows],
          ]}
        />
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Status</span>
          <Badge>{result.status}</Badge>
        </div>
      </CardContent>
    </Card>
  )
}

function RecentImportsPanel({
  query,
}: {
  query: ReturnType<typeof useApiQuery<ImportRecord[]>>
}) {
  if (query.isLoading) {
    return <LoadingState message="Loading imports" />
  }

  if (query.error || !query.data) {
    return <ErrorState message={query.error ?? "Imports are unavailable"} />
  }

  if (query.data.length === 0) {
    return <EmptyState message="No imports yet" />
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent imports</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Imported</TableHead>
              <TableHead className="text-right">Duplicates</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.data.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.fileName}</TableCell>
                <TableCell>{item.account?.name ?? item.sourceType}</TableCell>
                <TableCell>
                  <Badge>{item.status}</Badge>
                </TableCell>
                <TableCell className="text-right">{item.importedRows}</TableCell>
                <TableCell className="text-right">{item.duplicateRows}</TableCell>
                <TableCell>{formatDate(item.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function StatsGrid({ stats }: { stats: [string, number][] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {stats.map(([label, value]) => (
        <div key={label} className="rounded-lg border border-border p-3">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-xl font-semibold">{value}</p>
        </div>
      ))}
    </div>
  )
}

function buildImportFormData(file: File, accountId: string, sourceType: string) {
  const formData = new FormData()
  formData.set("file", file)
  formData.set("accountId", accountId)
  formData.set("sourceType", sourceType)
  return formData
}
