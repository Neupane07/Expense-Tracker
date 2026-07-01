import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatDateTime } from "@/lib/format"
import {
  DataQualityBadges,
  RejectReasonList,
  WarningsList,
} from "@/components/finance/finance-quality"
import type { ToolEnvelope, ToolExecutionStatus } from "@/pages/tool-tester-types"

function statusVariant(status: ToolExecutionStatus) {
  switch (status) {
    case "ok":
      return "default" as const
    case "rejected":
      return "secondary" as const
    case "unavailable":
      return "outline" as const
    case "error":
      return "destructive" as const
  }
}

export function ToolStatusBadge({ status }: { status: ToolExecutionStatus }) {
  return (
    <Badge data-testid="tool-status-badge" variant={statusVariant(status)}>
      {status.toUpperCase()}
    </Badge>
  )
}

function ServerValidationDetails({
  data,
}: {
  data: Record<string, unknown>
}) {
  const message =
    typeof data.message === "string" ? data.message : null
  const details = data.details as
    | { message?: string; issues?: Array<{ path?: string[]; message?: string }> }
    | undefined

  if (!message && !details?.issues?.length) {
    return null
  }

  return (
    <div
      className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm"
      data-testid="server-validation-error"
    >
      {message ? <p className="font-medium">{message}</p> : null}
      {details?.issues?.length ? (
        <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
          {details.issues.map((issue, index) => {
            const path = issue.path?.join(".") || "input"
            return (
              <li key={`${path}-${index}`}>
                {path}: {issue.message ?? "Invalid value"}
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

function DataQualityPanel({
  dataQuality,
}: {
  dataQuality: Record<string, unknown>
}) {
  const freshness =
    typeof dataQuality.freshness === "string" ? dataQuality.freshness : undefined
  const confidence =
    typeof dataQuality.confidence === "string"
      ? dataQuality.confidence
      : undefined
  const source =
    typeof dataQuality.source === "string" ? dataQuality.source : undefined

  if (!freshness && !confidence && !source && Object.keys(dataQuality).length === 0) {
    return null
  }

  return (
    <div className="space-y-2" data-testid="tool-data-quality">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Data quality
      </p>
      {freshness || confidence || source ? (
        <DataQualityBadges
          dataQuality={{ freshness, confidence, source }}
        />
      ) : (
        <pre className="max-h-40 overflow-auto rounded-md bg-muted p-2 font-mono text-xs">
          {JSON.stringify(dataQuality, null, 2)}
        </pre>
      )}
    </div>
  )
}

export function ToolEnvelopeView({ envelope }: { envelope: ToolEnvelope }) {
  return (
    <div className="space-y-4" data-testid="tool-envelope-view">
      <div className="flex flex-wrap items-center gap-2">
        <ToolStatusBadge status={envelope.status} />
        <Badge variant="outline">v{envelope.version}</Badge>
        <span className="text-xs text-muted-foreground">
          asOf {formatDateTime(envelope.asOf)}
        </span>
        <span className="text-xs text-muted-foreground" data-testid="tool-duration">
          {envelope.durationMs} ms
        </span>
        <span
          className="truncate text-xs text-muted-foreground"
          data-testid="tool-audit-id"
        >
          audit {envelope.auditId}
        </span>
      </div>

      <Tabs defaultValue="structured">
        <TabsList>
          <TabsTrigger value="structured">Structured</TabsTrigger>
          <TabsTrigger value="raw">Raw JSON</TabsTrigger>
        </TabsList>
        <TabsContent value="structured" className="space-y-4 pt-2">
          {envelope.status === "rejected" ? (
            <ServerValidationDetails data={envelope.data} />
          ) : null}
          <RejectReasonList reasons={envelope.rejectReasons} />
          <WarningsList warnings={envelope.warnings} />
          <DataQualityPanel dataQuality={envelope.dataQuality} />
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Data
            </p>
            <pre
              className="max-h-96 overflow-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed"
              data-testid="tool-envelope-data"
            >
              {JSON.stringify(envelope.data, null, 2)}
            </pre>
          </div>
        </TabsContent>
        <TabsContent value="raw" className="pt-2">
          <pre
            className="max-h-96 overflow-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed"
            data-testid="tool-envelope-raw"
          >
            {JSON.stringify(envelope, null, 2)}
          </pre>
        </TabsContent>
      </Tabs>
    </div>
  )
}
