import { useState } from "react"
import type { ReactNode } from "react"
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
import { apiPatchJson, apiPostJson } from "@/lib/api-client"
import { formatDate, formatMoney } from "@/lib/format"
import { useApiQuery } from "@/lib/use-api-query"
import type {
  CreateRuleInput,
  Rule,
  RuleApplySummary,
  Transaction,
} from "@/pages/types"
import { EmptyState, ErrorState, LoadingState } from "./page-state"

const expenseTypes = [
  "EXPENSE",
  "TRANSFER",
  "INVESTMENT",
  "INCOME",
  "REFUND",
  "REVIEW",
]

const matchTypes = ["CONTAINS", "EXACT", "STARTS_WITH", "REGEX"]

export function ReviewPage() {
  const [selectedTransaction, setSelectedTransaction] =
    useState<Transaction | null>(null)
  const [vendor, setVendor] = useState("")
  const [category, setCategory] = useState("")
  const [subcategory, setSubcategory] = useState("")
  const [expenseType, setExpenseType] = useState("EXPENSE")
  const [matchType, setMatchType] = useState("CONTAINS")
  const [pattern, setPattern] = useState("")
  const [lastRule, setLastRule] = useState<Rule | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const { data, error, isLoading } = useApiQuery<Transaction[]>(
    `/transactions?expenseType=REVIEW&refresh=${refreshKey}`,
  )

  function selectTransaction(transaction: Transaction) {
    setSelectedTransaction(transaction)
    setVendor(transaction.category?.vendor ?? "")
    setCategory(transaction.category?.category ?? "")
    setSubcategory(transaction.category?.subcategory ?? "")
    setExpenseType(transaction.category?.expenseType ?? "EXPENSE")
    setPattern(transaction.descriptionClean || transaction.descriptionRaw)
    setLastRule(null)
    setMessage(null)
    setActionError(null)
  }

  async function updateCategory() {
    if (!selectedTransaction) {
      return
    }

    setIsSaving(true)
    setActionError(null)
    setMessage(null)

    try {
      await apiPatchJson(`/transactions/${selectedTransaction.id}/category`, {
        vendor,
        category,
        subcategory,
        expenseType,
      })
      setMessage("Category updated.")
      setRefreshKey((value) => value + 1)
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Unable to update category",
      )
    } finally {
      setIsSaving(false)
    }
  }

  async function createRule() {
    setIsSaving(true)
    setActionError(null)
    setMessage(null)

    const body: CreateRuleInput = {
      matchType,
      pattern,
      vendor,
      category,
      subcategory,
      expenseType,
    }

    try {
      const rule = await apiPostJson<Rule>("/rules", body)
      setLastRule(rule)
      setMessage("Rule created.")
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to create rule")
    } finally {
      setIsSaving(false)
    }
  }

  async function applyRule() {
    if (!lastRule) {
      return
    }

    setIsSaving(true)
    setActionError(null)
    setMessage(null)

    try {
      const summary = await apiPostJson<RuleApplySummary>(
        `/rules/${lastRule.id}/apply`,
        {},
      )
      setMessage(`Rule applied to ${summary.updatedRows} transactions.`)
      setRefreshKey((value) => value + 1)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to apply rule")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <ReviewTransactions
        data={data}
        error={error}
        isLoading={isLoading}
        selectedId={selectedTransaction?.id}
        onSelect={selectTransaction}
      />

      <Card>
        <CardHeader>
          <CardTitle>Manual review</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {selectedTransaction ? (
            <>
              <div className="rounded-lg border border-border p-3 text-sm">
                <p className="font-medium">{selectedTransaction.descriptionRaw}</p>
                <p className="mt-1 text-muted-foreground">
                  {formatDate(selectedTransaction.transactionDate)} ·{" "}
                  {formatMoney(selectedTransaction.moneyOut)}
                </p>
              </div>

              <Field label="Vendor">
                <Input value={vendor} onChange={(event) => setVendor(event.target.value)} />
              </Field>
              <Field label="Category">
                <Input
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                />
              </Field>
              <Field label="Subcategory">
                <Input
                  value={subcategory}
                  onChange={(event) => setSubcategory(event.target.value)}
                />
              </Field>
              <Field label="Expense type">
                <Select value={expenseType} onValueChange={setExpenseType}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {expenseTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Button
                className="w-full"
                onClick={updateCategory}
                disabled={isSaving || !vendor || !category}
              >
                Save category
              </Button>

              <div className="border-t border-border pt-4">
                <div className="mb-3 text-sm font-medium">Create rule</div>
                <div className="space-y-3">
                  <Field label="Match type">
                    <Select value={matchType} onValueChange={setMatchType}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {matchTypes.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Pattern">
                    <Input
                      value={pattern}
                      onChange={(event) => setPattern(event.target.value)}
                    />
                  </Field>
                  <Button
                    className="w-full"
                    onClick={createRule}
                    disabled={isSaving || !pattern || !vendor || !category}
                  >
                    Create rule
                  </Button>
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={applyRule}
                    disabled={isSaving || !lastRule}
                  >
                    Apply rule to similar
                  </Button>
                </div>
              </div>

              {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
              {actionError ? <ErrorState message={actionError} /> : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Select a transaction to edit its category or create a rule.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function ReviewTransactions({
  data,
  error,
  isLoading,
  selectedId,
  onSelect,
}: {
  data: Transaction[] | null
  error: string | null
  isLoading: boolean
  selectedId?: string
  onSelect: (transaction: Transaction) => void
}) {
  if (isLoading) {
    return <LoadingState message="Loading review queue" />
  }

  if (error || !data) {
    return <ErrorState message={error ?? "Review queue is unavailable"} />
  }

  if (data.length === 0) {
    return <EmptyState message="No transactions need review" />
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transactions needing review</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Money out</TableHead>
              <TableHead>Type</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((transaction) => (
              <TableRow key={transaction.id}>
                <TableCell>{formatDate(transaction.transactionDate)}</TableCell>
                <TableCell className="min-w-72 font-medium">
                  {transaction.descriptionRaw}
                </TableCell>
                <TableCell className="text-right">
                  {formatMoney(transaction.moneyOut)}
                </TableCell>
                <TableCell>
                  <Badge>{transaction.category?.expenseType ?? "REVIEW"}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant={selectedId === transaction.id ? "default" : "outline"}
                    onClick={() => onSelect(transaction)}
                  >
                    Select
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  )
}
