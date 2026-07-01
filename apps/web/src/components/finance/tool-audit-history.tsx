import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDateTime } from "@/lib/format"
import { ToolStatusBadge } from "@/components/finance/tool-envelope-view"
import type { ToolAuditItem } from "@/pages/tool-tester-types"
import { EmptyState, ErrorState, LoadingState } from "@/pages/page-state"

type ToolAuditHistoryProps = {
  audits: ToolAuditItem[] | null
  isLoading: boolean
  error: string | null
}

function formatInputKeys(inputMeta: Record<string, unknown>) {
  const keys = inputMeta.keys
  if (Array.isArray(keys) && keys.every((key) => typeof key === "string")) {
    return keys.length > 0 ? keys.join(", ") : "—"
  }

  return "—"
}

export function ToolAuditHistory({
  audits,
  isLoading,
  error,
}: ToolAuditHistoryProps) {
  if (isLoading) {
    return <LoadingState message="Loading audit history" />
  }

  if (error) {
    return <ErrorState message={error} />
  }

  if (!audits || audits.length === 0) {
    return (
      <EmptyState message="No tool executions recorded yet. Run a tool to create an audit entry." />
    )
  }

  return (
    <div data-testid="tool-audit-history">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tool</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Warnings</TableHead>
            <TableHead>Rejects</TableHead>
            <TableHead>Input keys</TableHead>
            <TableHead>Started</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {audits.map((audit) => (
            <TableRow key={audit.id} data-testid="tool-audit-row">
              <TableCell>
                <div className="space-y-1">
                  <p className="font-medium">{audit.toolName}</p>
                  <Badge variant="outline">v{audit.toolVersion}</Badge>
                </div>
              </TableCell>
              <TableCell>
                <ToolStatusBadge status={audit.status} />
              </TableCell>
              <TableCell>
                {audit.durationMs !== null ? `${audit.durationMs} ms` : "—"}
              </TableCell>
              <TableCell>{audit.warningCount}</TableCell>
              <TableCell>{audit.rejectCount}</TableCell>
              <TableCell className="max-w-[12rem] truncate text-xs text-muted-foreground">
                {formatInputKeys(audit.inputMeta)}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {formatDateTime(audit.startedAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
