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
import { useApiQuery } from "@/lib/use-api-query"
import type { Rule } from "@/pages/types"
import { EmptyState, ErrorState, LoadingState } from "./page-state"

export function RulesPage() {
  const { data, error, isLoading } = useApiQuery<Rule[]>("/rules")

  if (isLoading) {
    return <LoadingState message="Loading rules" />
  }

  if (error || !data) {
    return <ErrorState message={error ?? "Rules are unavailable"} />
  }

  if (data.length === 0) {
    return <EmptyState message="No rules configured" />
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rules</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Priority</TableHead>
              <TableHead>Pattern</TableHead>
              <TableHead>Match</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Expense type</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((rule) => (
              <TableRow key={rule.id}>
                <TableCell>{rule.priority}</TableCell>
                <TableCell className="font-mono text-xs">{rule.pattern}</TableCell>
                <TableCell>{rule.matchType}</TableCell>
                <TableCell>{rule.vendor}</TableCell>
                <TableCell>{rule.category}</TableCell>
                <TableCell>
                  <Badge>{rule.expenseType}</Badge>
                </TableCell>
                <TableCell>{rule.isActive ? "Active" : "Inactive"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
