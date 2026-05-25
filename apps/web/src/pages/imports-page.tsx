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
import { formatDate } from "@/lib/format"
import { useApiQuery } from "@/lib/use-api-query"
import type { ImportRecord } from "@/pages/types"
import { EmptyState, ErrorState, LoadingState } from "./page-state"

export function ImportsPage() {
  const { data, error, isLoading } = useApiQuery<ImportRecord[]>("/imports")

  if (isLoading) {
    return <LoadingState message="Loading imports" />
  }

  if (error || !data) {
    return <ErrorState message={error ?? "Imports are unavailable"} />
  }

  if (data.length === 0) {
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
            {data.map((item) => (
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
