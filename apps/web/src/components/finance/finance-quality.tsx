import { Badge } from "@/components/ui/badge"

export const RESEARCH_ONLY_DISCLAIMER =
  "Research only — verify and place manually in Dhan."

export function ResearchDisclaimer({
  text,
}: {
  text?: string
}) {
  const message = text ?? RESEARCH_ONLY_DISCLAIMER
  return (
    <p
      data-testid="research-disclaimer"
      className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
    >
      {message}
    </p>
  )
}

export function ReadinessStatusBadge({
  status,
}: {
  status: "READY" | "DEGRADED" | "BLOCKED"
}) {
  const variant =
    status === "READY"
      ? "default"
      : status === "DEGRADED"
        ? "secondary"
        : "destructive"

  return (
    <Badge data-testid="readiness-status" variant={variant}>
      {status}
    </Badge>
  )
}

export function WarningsList({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) {
    return null
  }

  return (
    <div data-testid="warnings-list" className="flex flex-wrap gap-1">
      {warnings.map((warning) => (
        <Badge key={warning} variant="outline">
          {warning}
        </Badge>
      ))}
    </div>
  )
}

export function RejectReasonList({ reasons }: { reasons: string[] }) {
  if (reasons.length === 0) {
    return null
  }

  return (
    <div data-testid="reject-reason-list" className="flex flex-wrap gap-1">
      {reasons.map((reason) => (
        <Badge key={reason} variant="destructive">
          {reason}
        </Badge>
      ))}
    </div>
  )
}

export type DataQualityView = {
  freshness?: string
  confidence?: string
  source?: string
  asOf?: string
}

function freshnessVariant(freshness: string | undefined) {
  if (freshness === "LIVE") {
    return "default" as const
  }

  if (freshness === "RECENT") {
    return "secondary" as const
  }

  return "outline" as const
}

export function DataQualityBadges({
  dataQuality,
  warnings = [],
}: {
  dataQuality?: DataQualityView
  warnings?: string[]
}) {
  return (
    <div data-testid="data-quality-badges" className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={freshnessVariant(dataQuality?.freshness)}>
          {dataQuality?.freshness ?? "MISSING"}
        </Badge>
        <Badge variant="outline">{dataQuality?.confidence ?? "LOW"}</Badge>
        {dataQuality?.source ? (
          <Badge variant="outline">{dataQuality.source}</Badge>
        ) : null}
      </div>
      <WarningsList warnings={warnings} />
    </div>
  )
}
