import type { CSSProperties, ReactNode } from "react"
import { cn } from "@/lib/utils"

type MetricCardProps = {
  label: string
  value: string
  hint?: ReactNode
  emphasis?: "default" | "muted"
  accentColor?: string
  className?: string
}

export function MetricCard({
  label,
  value,
  hint,
  emphasis = "default",
  accentColor,
  className,
}: MetricCardProps) {
  const style = accentColor
    ? ({
        "--metric-accent": accentColor,
      } as CSSProperties)
    : undefined

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-border bg-card p-3",
        emphasis === "muted" && "bg-muted/40",
        className,
      )}
      style={style}
    >
      {accentColor ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-1"
          style={{ backgroundColor: "var(--metric-accent)" }}
        />
      ) : null}
      <p
        className={cn(
          "text-xs font-medium uppercase tracking-wide text-muted-foreground",
          accentColor && "pl-2",
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          "mt-1 font-semibold",
          emphasis === "muted" ? "text-base" : "text-lg",
          accentColor && "pl-2",
        )}
      >
        {value}
      </p>
      {hint ? (
        <p
          className={cn(
            "mt-1 text-xs text-muted-foreground",
            accentColor && "pl-2",
          )}
        >
          {hint}
        </p>
      ) : null}
    </div>
  )
}
