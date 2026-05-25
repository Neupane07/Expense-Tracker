import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDate, formatMoney } from "@/lib/format"
import { useApiQuery } from "@/lib/use-api-query"
import type { Transaction } from "@/pages/types"
import { EmptyState, ErrorState, LoadingState } from "./page-state"

type TransactionsPageProps = {
  reviewOnly?: boolean
}

export function TransactionsPage({ reviewOnly = false }: TransactionsPageProps) {
  const path = reviewOnly ? "/transactions?expenseType=REVIEW" : "/transactions"
  const { data, error, isLoading } = useApiQuery<Transaction[]>(path)

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
        <CardTitle>
          {reviewOnly ? "Transactions needing review" : "All transactions"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Money out</TableHead>
              <TableHead className="text-right">Money in</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Expense type</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{formatDate(item.transactionDate)}</TableCell>
                <TableCell className="min-w-64 font-medium">
                  {item.descriptionRaw}
                </TableCell>
                <TableCell>{item.account?.name ?? item.sourceType}</TableCell>
                <TableCell className="text-right">
                  {formatMoney(item.moneyOut)}
                </TableCell>
                <TableCell className="text-right">
                  {formatMoney(item.moneyIn)}
                </TableCell>
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
