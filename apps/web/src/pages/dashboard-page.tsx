import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatMoney } from "@/lib/format"
import { useApiQuery } from "@/lib/use-api-query"
import type { DashboardSummary } from "@/pages/types"
import { ErrorState, LoadingState } from "./page-state"

const summaryCards: {
  key: keyof DashboardSummary
  label: string
}[] = [
  { key: "totalExpense", label: "Total expense" },
  { key: "bankExpense", label: "Bank/UPI expense" },
  { key: "creditCardExpense", label: "Credit card expense" },
  { key: "transfersExcluded", label: "Transfers excluded" },
  { key: "investmentsExcluded", label: "Investments excluded" },
  { key: "refunds", label: "Refunds" },
  { key: "reviewAmount", label: "Review amount" },
]

export function DashboardPage() {
  const { data, error, isLoading } =
    useApiQuery<DashboardSummary>("/dashboard/summary")

  if (isLoading) {
    return <LoadingState message="Loading dashboard summary" />
  }

  if (error || !data) {
    return <ErrorState message={error ?? "Dashboard summary is unavailable"} />
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {summaryCards.map((item) => (
        <Card key={item.key}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              {item.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{formatMoney(data[item.key])}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
