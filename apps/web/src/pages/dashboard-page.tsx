import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatMoney } from "@/lib/format"
import { useApiQuery } from "@/lib/use-api-query"
import type {
  DashboardChartRow,
  DashboardCharts,
  DashboardSummary,
  MonthlyTrendRow,
} from "@/pages/types"
import { EmptyState, ErrorState, LoadingState } from "./page-state"

const summaryCards: {
  key: keyof DashboardSummary
  label: string
}[] = [
  { key: "totalExpense", label: "Total actual expense" },
  { key: "bankExpense", label: "Bank/UPI expense" },
  { key: "creditCardExpense", label: "Credit card expense" },
  { key: "transfersExcluded", label: "Transfers excluded" },
  { key: "investmentsExcluded", label: "Investments excluded" },
  { key: "refunds", label: "Refund amount" },
  { key: "reviewAmount", label: "Review amount" },
]

export function DashboardPage() {
  const summaryQuery = useApiQuery<DashboardSummary>("/dashboard/summary")
  const chartsQuery = useApiQuery<DashboardCharts>("/dashboard/charts")

  if (summaryQuery.isLoading || chartsQuery.isLoading) {
    return <LoadingState message="Loading dashboard" />
  }

  if (summaryQuery.error || chartsQuery.error) {
    return (
      <ErrorState
        message={
          summaryQuery.error ??
          chartsQuery.error ??
          "Dashboard data is unavailable"
        }
      />
    )
  }

  if (!summaryQuery.data || !chartsQuery.data) {
    return <ErrorState message="Dashboard data is unavailable" />
  }

  const summary = summaryQuery.data
  const charts = chartsQuery.data

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((item) => (
          <Card key={item.key}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                {item.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">
                {formatMoney(summary[item.key])}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <SpendBarCard
          title="Category-wise spend"
          data={charts.categorySpend}
        />
        <SpendBarCard
          title="Vendor-wise spend"
          data={charts.vendorSpend}
        />
        <SpendBarCard
          title="Source-wise spend"
          data={charts.sourceSpend.map((row) => ({
            ...row,
            name: formatSourceType(row.name),
          }))}
        />
        <MonthlyTrendCard data={charts.monthlyTrend} />
      </div>
    </div>
  )
}

function SpendBarCard({
  title,
  data,
}: {
  title: string
  data: DashboardChartRow[]
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.length === 0 ? (
          <EmptyState message="No expense data yet" />
        ) : (
          <>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.slice(0, 10)} layout="vertical">
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={compactMoney} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={120}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip formatter={(value) => formatMoney(Number(value))} />
                  <Bar dataKey="amount" fill="var(--primary)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <SpendTable rows={data} label="Name" />
          </>
        )}
      </CardContent>
    </Card>
  )
}

function MonthlyTrendCard({ data }: { data: MonthlyTrendRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly trend</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.length === 0 ? (
          <EmptyState message="No monthly expense data yet" />
        ) : (
          <>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={compactMoney} />
                  <Tooltip formatter={(value) => formatMoney(Number(value))} />
                  <Line
                    type="monotone"
                    dataKey="amount"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <MonthlyTrendTable rows={data} />
          </>
        )}
      </CardContent>
    </Card>
  )
}

function SpendTable({
  rows,
  label,
}: {
  rows: DashboardChartRow[]
  label: string
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{label}</TableHead>
          <TableHead className="text-right">Spend</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.slice(0, 10).map((row) => (
          <TableRow key={row.name}>
            <TableCell className="font-medium">{row.name}</TableCell>
            <TableCell className="text-right">{formatMoney(row.amount)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function MonthlyTrendTable({ rows }: { rows: MonthlyTrendRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Month</TableHead>
          <TableHead className="text-right">Spend</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.month}>
            <TableCell className="font-medium">{row.month}</TableCell>
            <TableCell className="text-right">{formatMoney(row.amount)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function compactMoney(value: number) {
  if (value >= 100000) {
    return `₹${Math.round(value / 100000)}L`
  }

  if (value >= 1000) {
    return `₹${Math.round(value / 1000)}k`
  }

  return `₹${value}`
}

function formatSourceType(sourceType: string) {
  const labels: Record<string, string> = {
    ICICI_AMAZON_PAY_CARD: "ICICI Amazon Pay Card",
    ICICI_BANK: "ICICI Bank/UPI",
  }

  return labels[sourceType] ?? sourceType
}
