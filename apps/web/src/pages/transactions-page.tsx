import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
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
import { buildQuery } from "@/lib/api-client"
import { formatDate, formatMoney } from "@/lib/format"
import { useApiQuery } from "@/lib/use-api-query"
import type { Transaction } from "@/pages/types"
import { EmptyState, ErrorState, LoadingState } from "./page-state"

const sourceTypes = [
  { value: "all", label: "All sources" },
  { value: "ICICI_BANK", label: "ICICI Bank" },
  { value: "ICICI_AMAZON_PAY_CARD", label: "ICICI Amazon Pay Card" },
]

const expenseTypes = [
  "all",
  "EXPENSE",
  "TRANSFER",
  "INVESTMENT",
  "INCOME",
  "REFUND",
  "REVIEW",
]

export function TransactionsPage() {
  const [month, setMonth] = useState("")
  const [sourceType, setSourceType] = useState("all")
  const [expenseType, setExpenseType] = useState("all")
  const [search, setSearch] = useState("")
  const path = useMemo(
    () =>
      `/transactions${buildQuery({
        month,
        sourceType: sourceType === "all" ? undefined : sourceType,
        expenseType: expenseType === "all" ? undefined : expenseType,
        search,
      })}`,
    [expenseType, month, search, sourceType],
  )
  const { data, error, isLoading } = useApiQuery<Transaction[]>(path)

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="month">Month</Label>
            <Input
              id="month"
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Source</Label>
            <Select value={sourceType} onValueChange={setSourceType}>
              <SelectTrigger className="w-full">
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
            <Label>Expense type</Label>
            <Select value={expenseType} onValueChange={setExpenseType}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {expenseTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type === "all" ? "All types" : type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="search">Search</Label>
            <Input
              id="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Description, vendor, category"
            />
          </div>
        </CardContent>
      </Card>

      <TransactionsTable data={data} error={error} isLoading={isLoading} />
    </div>
  )
}

export function TransactionsTable({
  data,
  error,
  isLoading,
}: {
  data: Transaction[] | null
  error: string | null
  isLoading: boolean
}) {
  if (isLoading) {
    return <LoadingState message="Loading transactions" />
  }

  if (error || !data) {
    return <ErrorState message={error ?? "Transactions are unavailable"} />
  }

  if (data.length === 0) {
    return <EmptyState message="No transactions found" />
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transactions</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Money out</TableHead>
              <TableHead className="text-right">Money in</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Expense type</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{formatDate(item.transactionDate)}</TableCell>
                <TableCell>{item.account?.name ?? item.sourceType}</TableCell>
                <TableCell className="min-w-72 font-medium">
                  {item.descriptionRaw}
                </TableCell>
                <TableCell className="text-right">
                  {formatMoney(item.moneyOut)}
                </TableCell>
                <TableCell className="text-right">
                  {formatMoney(item.moneyIn)}
                </TableCell>
                <TableCell>{item.category?.vendor ?? "-"}</TableCell>
                <TableCell>{item.category?.category ?? "-"}</TableCell>
                <TableCell>
                  {item.category?.expenseType ? (
                    <Badge>{item.category.expenseType}</Badge>
                  ) : (
                    "-"
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
