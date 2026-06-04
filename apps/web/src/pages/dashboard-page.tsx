import { useMemo, useState } from "react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import { MetricCard } from "@/components/metric-card"
import { buildQuery } from "@/lib/api-client"
import {
  dashboardPresets,
  defaultDashboardPeriod,
  describePeriod,
  isCustomRangeInvalid,
  periodToQuery,
  setMonth,
  setRangeFrom,
  setRangeTo,
  transitionPreset,
  type DashboardPeriod,
  type DashboardPresetId,
} from "@/lib/dashboard-period"
import { formatMoney, formatPercent } from "@/lib/format"
import { useApiQuery } from "@/lib/use-api-query"
import type {
  DashboardChartRow,
  DashboardCharts,
  DashboardSummary,
  MonthlyTrendRow,
} from "@/pages/types"
import { EmptyState, ErrorState, LoadingState } from "./page-state"

const CATEGORY_PIE_LIMIT = 8

const chartColors = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

export function DashboardPage() {
  const [period, setPeriod] = useState<DashboardPeriod>(defaultDashboardPeriod)

  const queryString = useMemo(() => buildQuery(periodToQuery(period)), [period])
  const skipQuery = isCustomRangeInvalid(period)
  const summaryPath = skipQuery ? "" : `/dashboard/summary${queryString}`
  const chartsPath = skipQuery ? "" : `/dashboard/charts${queryString}`

  const summaryQuery = useApiQuery<DashboardSummary>(summaryPath)
  const chartsQuery = useApiQuery<DashboardCharts>(chartsPath)

  const periodLabel = describePeriod(period)

  const isLoading = summaryQuery.isLoading || chartsQuery.isLoading
  const error = summaryQuery.error ?? chartsQuery.error

  return (
    <div className="space-y-5">
      <PeriodFilterCard
        period={period}
        onChange={setPeriod}
        periodLabel={periodLabel}
      />

      {skipQuery ? (
        <ErrorState message="Custom range: 'from' must be on or before 'to'." />
      ) : isLoading ? (
        <LoadingState message="Loading dashboard" />
      ) : error ? (
        <ErrorState message={error} />
      ) : summaryQuery.data && chartsQuery.data ? (
        <DashboardContent
          summary={summaryQuery.data}
          charts={chartsQuery.data}
          periodLabel={periodLabel}
        />
      ) : (
        <ErrorState message="Dashboard data is unavailable" />
      )}
    </div>
  )
}

function DashboardContent({
  summary,
  charts,
  periodLabel,
}: {
  summary: DashboardSummary
  charts: DashboardCharts
  periodLabel: string
}) {
  const netExpense = summary.totalExpense - summary.refunds

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total expense"
          value={formatMoney(summary.totalExpense)}
          hint={periodLabel}
          accentColor="var(--chart-1)"
        />
        <MetricCard
          label="Bank / UPI"
          value={formatMoney(summary.bankExpense)}
          hint={shareHint(summary.bankExpense, summary.totalExpense)}
          accentColor="var(--chart-2)"
        />
        <MetricCard
          label="Credit card"
          value={formatMoney(summary.creditCardExpense)}
          hint={shareHint(summary.creditCardExpense, summary.totalExpense)}
          accentColor="var(--chart-4)"
        />
        <MetricCard
          label="Needs review"
          value={formatMoney(summary.reviewAmount)}
          hint={summary.reviewAmount > 0 ? "Open Review queue" : "All clear"}
          accentColor={
            summary.reviewAmount > 0 ? "var(--destructive)" : "var(--chart-3)"
          }
        />
      </div>

      <Card>
        <CardHeader className="gap-1">
          <CardTitle>Excluded from spend</CardTitle>
          <CardDescription>
            Transfers and investments are tracked separately so they do not
            inflate expense totals.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <MetricCard
            label="Transfers"
            value={formatMoney(summary.transfersExcluded)}
            emphasis="muted"
          />
          <MetricCard
            label="Investments"
            value={formatMoney(summary.investmentsExcluded)}
            emphasis="muted"
          />
          <MetricCard
            label="Refunds received"
            value={formatMoney(summary.refunds)}
            emphasis="muted"
            hint={
              summary.refunds > 0
                ? `Net expense ${formatMoney(netExpense)}`
                : undefined
            }
          />
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <CategoryPieCard data={charts.categorySpend} />
        <CategoryBreakdownCard data={charts.categorySpend} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <SpendBarCard
          title="Top vendors"
          description="Where money went this period"
          data={charts.vendorSpend}
          color="var(--chart-2)"
        />
        <SpendBarCard
          title="By source"
          description="Bank account vs credit card"
          data={charts.sourceSpend.map((row) => ({
            ...row,
            name: formatSourceType(row.name),
          }))}
          color="var(--chart-4)"
        />
      </div>

      <MonthlyTrendCard data={charts.monthlyTrend} />
    </div>
  )
}

function PeriodFilterCard({
  period,
  onChange,
  periodLabel,
}: {
  period: DashboardPeriod
  onChange: (period: DashboardPeriod) => void
  periodLabel: string
}) {
  const showMonthInput = period.preset === "custom-month"
  const showRangeInputs = period.preset === "custom-range"
  const rangeInvalid = isCustomRangeInvalid(period)
  const presetLabel =
    dashboardPresets.find((preset) => preset.id === period.preset)?.label ??
    "Custom"

  return (
    <Card>
      <CardHeader className="gap-1">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle>Spending overview</CardTitle>
            <CardDescription>Showing {periodLabel}</CardDescription>
          </div>
          <Badge variant="outline" className="self-start sm:self-auto">
            {presetLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="dashboard-preset">Period</Label>
            <Select
              value={period.preset}
              onValueChange={(value) =>
                onChange(transitionPreset(period, value as DashboardPresetId))
              }
            >
              <SelectTrigger id="dashboard-preset" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {dashboardPresets.map((preset) => (
                  <SelectItem key={preset.id} value={preset.id}>
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {showMonthInput ? (
            <div className="space-y-2">
              <Label htmlFor="dashboard-month">Month</Label>
              <Input
                id="dashboard-month"
                type="month"
                value={period.month}
                onChange={(event) =>
                  onChange(setMonth(period, event.target.value))
                }
              />
            </div>
          ) : null}

          {showRangeInputs ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="dashboard-from">From</Label>
                <Input
                  id="dashboard-from"
                  type="date"
                  value={period.from}
                  max={period.to || undefined}
                  onChange={(event) =>
                    onChange(setRangeFrom(period, event.target.value))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dashboard-to">To</Label>
                <Input
                  id="dashboard-to"
                  type="date"
                  value={period.to}
                  min={period.from || undefined}
                  onChange={(event) =>
                    onChange(setRangeTo(period, event.target.value))
                  }
                />
              </div>
            </>
          ) : null}
        </div>
        {rangeInvalid ? (
          <p className="text-sm text-destructive">
            "From" must be on or before "To".
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

function CategoryPieCard({ data }: { data: DashboardChartRow[] }) {
  const pieData = useMemo(
    () => collapseLongTail(data, CATEGORY_PIE_LIMIT),
    [data],
  )
  const total = data.reduce((sum, row) => sum + row.amount, 0)

  return (
    <Card>
      <CardHeader className="gap-1">
        <CardTitle>Category mix</CardTitle>
        <CardDescription>
          Share of expenses by category for the selected period.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <EmptyState message="No expense data for this period" />
        ) : (
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
            <div className="relative h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="amount"
                    nameKey="name"
                    innerRadius="55%"
                    outerRadius="85%"
                    paddingAngle={1}
                    stroke="var(--background)"
                    strokeWidth={2}
                  >
                    {pieData.map((entry, index) => (
                      <Cell
                        key={entry.name}
                        fill={chartColors[index % chartColors.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: unknown, name: unknown) => [
                      formatMoney(Number(value)),
                      String(name),
                    ]}
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      color: "var(--popover-foreground)",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Total
                </p>
                <p className="text-xl font-semibold">{formatMoney(total)}</p>
              </div>
            </div>
            <ul className="space-y-2 text-sm md:max-w-[220px]">
              {pieData.map((entry, index) => (
                <li
                  key={entry.name}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="size-2.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor:
                          chartColors[index % chartColors.length],
                      }}
                    />
                    <span className="truncate">{entry.name}</span>
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {formatPercent(entry.percent ?? 0)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function CategoryBreakdownCard({ data }: { data: DashboardChartRow[] }) {
  const visible = data.slice(0, 8)

  return (
    <Card>
      <CardHeader className="gap-1">
        <CardTitle>Top categories</CardTitle>
        <CardDescription>
          Amount and share by category, biggest first.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {visible.length === 0 ? (
          <EmptyState message="No categorized expenses yet" />
        ) : (
          visible.map((row, index) => (
            <CategoryRow
              key={row.name}
              label={row.name}
              amount={row.amount}
              percent={row.percent ?? 0}
              color={chartColors[index % chartColors.length]}
            />
          ))
        )}
      </CardContent>
    </Card>
  )
}

function CategoryRow({
  label,
  amount,
  percent,
  color,
}: {
  label: string
  amount: number
  percent: number
  color: string
}) {
  const width = Math.min(Math.max(percent, 0), 100)
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span className="truncate font-medium">{label}</span>
        </span>
        <span className="text-muted-foreground tabular-nums">
          {formatMoney(amount)} · {formatPercent(percent)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full"
          style={{ width: `${width}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

function SpendBarCard({
  title,
  description,
  data,
  color,
}: {
  title: string
  description: string
  data: DashboardChartRow[]
  color: string
}) {
  const top = data.slice(0, 10)

  return (
    <Card>
      <CardHeader className="gap-1">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {top.length === 0 ? (
          <EmptyState message="No expense data for this period" />
        ) : (
          <>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={top} layout="vertical">
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={compactMoney} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={120}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    formatter={(value) => formatMoney(Number(value))}
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      color: "var(--popover-foreground)",
                    }}
                    cursor={{ fill: "var(--muted)" }}
                  />
                  <Bar dataKey="amount" fill={color} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                  <TableHead className="text-right">Share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {top.map((row) => (
                  <TableRow key={row.name}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(row.amount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatPercent(row.percent ?? 0)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function MonthlyTrendCard({ data }: { data: MonthlyTrendRow[] }) {
  const labelled = useMemo(
    () => data.map((row) => ({ ...row, label: formatMonthShort(row.month) })),
    [data],
  )

  return (
    <Card>
      <CardHeader className="gap-1">
        <CardTitle>Monthly trend</CardTitle>
        <CardDescription>
          Last 12 months of expenses, independent of the filter above.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {labelled.length === 0 ? (
          <EmptyState message="No monthly expense data yet" />
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={labelled}>
                <defs>
                  <linearGradient
                    id="dashboard-trend-fill"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor="var(--chart-1)"
                      stopOpacity={0.4}
                    />
                    <stop
                      offset="100%"
                      stopColor="var(--chart-1)"
                      stopOpacity={0.02}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis tickFormatter={compactMoney} />
                <Tooltip
                  labelFormatter={(label, payload) => {
                    const month = payload?.[0]?.payload?.month as
                      | string
                      | undefined
                    return month ? formatMonthLong(month) : String(label)
                  }}
                  formatter={(value) => formatMoney(Number(value))}
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    color: "var(--popover-foreground)",
                  }}
                  cursor={{ stroke: "var(--chart-1)", strokeOpacity: 0.4 }}
                />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  fill="url(#dashboard-trend-fill)"
                  dot={{ r: 3, fill: "var(--chart-1)", strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function shareHint(value: number, total: number) {
  if (total <= 0 || value <= 0) {
    return undefined
  }
  const share = (value / total) * 100
  return `${formatPercent(Math.round(share * 10) / 10)} of total`
}

function collapseLongTail(rows: DashboardChartRow[], limit: number) {
  if (rows.length <= limit) {
    return rows
  }

  const head = rows.slice(0, limit - 1)
  const tail = rows.slice(limit - 1)
  const tailAmount = tail.reduce((sum, row) => sum + row.amount, 0)
  const tailPercent = tail.reduce((sum, row) => sum + (row.percent ?? 0), 0)

  return [
    ...head,
    {
      name: `Other (${tail.length})`,
      amount: Math.round(tailAmount * 100) / 100,
      percent: Math.round(tailPercent * 10) / 10,
    },
  ]
}

function compactMoney(value: number) {
  if (value >= 100000) {
    return `\u20B9${Math.round(value / 100000)}L`
  }

  if (value >= 1000) {
    return `\u20B9${Math.round(value / 1000)}k`
  }

  return `\u20B9${value}`
}

function formatMonthShort(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number)
  if (!year || !month) {
    return monthKey
  }
  return new Intl.DateTimeFormat("en-IN", {
    month: "short",
    year: "2-digit",
  }).format(new Date(year, month - 1, 1))
}

function formatMonthLong(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number)
  if (!year || !month) {
    return monthKey
  }
  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1))
}

function formatSourceType(sourceType: string) {
  const labels: Record<string, string> = {
    ICICI_AMAZON_PAY_CARD: "ICICI Amazon Pay Card",
    ICICI_BANK: "ICICI Bank/UPI",
  }

  return labels[sourceType] ?? sourceType
}
