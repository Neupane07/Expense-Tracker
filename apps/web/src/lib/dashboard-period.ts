export type DashboardPresetId =
  | "this-month"
  | "last-month"
  | "last-3-months"
  | "last-6-months"
  | "year-to-date"
  | "all-time"
  | "custom-month"
  | "custom-range"

export type DashboardPeriod = {
  preset: DashboardPresetId
  month: string
  from: string
  to: string
}

export type DashboardPeriodQuery = {
  month?: string
  from?: string
  to?: string
}

export const dashboardPresets: Array<{
  id: DashboardPresetId
  label: string
}> = [
  { id: "this-month", label: "This month" },
  { id: "last-month", label: "Last month" },
  { id: "last-3-months", label: "Last 3 months" },
  { id: "last-6-months", label: "Last 6 months" },
  { id: "year-to-date", label: "Year to date" },
  { id: "all-time", label: "All time" },
  { id: "custom-month", label: "Pick a month" },
  { id: "custom-range", label: "Custom range" },
]

export function currentMonthKey(date: Date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  return `${year}-${month}`
}

export function previousMonthKey(date: Date = new Date()) {
  const adjusted = new Date(date.getFullYear(), date.getMonth() - 1, 1)
  return currentMonthKey(adjusted)
}

export function defaultDashboardPeriod(): DashboardPeriod {
  return {
    preset: "this-month",
    month: currentMonthKey(),
    from: monthStartIso(),
    to: todayIso(),
  }
}

export function transitionPreset(
  current: DashboardPeriod,
  next: DashboardPresetId,
): DashboardPeriod {
  switch (next) {
    case "custom-month":
      return {
        preset: next,
        month: current.month || currentMonthKey(),
        from: current.from,
        to: current.to,
      }
    case "custom-range":
      return {
        preset: next,
        month: current.month,
        from: current.from || monthStartIso(),
        to: current.to || todayIso(),
      }
    default:
      return {
        preset: next,
        month: current.month || currentMonthKey(),
        from: current.from || monthStartIso(),
        to: current.to || todayIso(),
      }
  }
}

export function setMonth(
  current: DashboardPeriod,
  month: string,
): DashboardPeriod {
  if (!month) {
    return current
  }
  return { ...current, preset: "custom-month", month }
}

export function setRangeFrom(
  current: DashboardPeriod,
  from: string,
): DashboardPeriod {
  return { ...current, preset: "custom-range", from }
}

export function setRangeTo(
  current: DashboardPeriod,
  to: string,
): DashboardPeriod {
  return { ...current, preset: "custom-range", to }
}

export function periodToQuery(period: DashboardPeriod): DashboardPeriodQuery {
  switch (period.preset) {
    case "this-month":
      return { month: currentMonthKey() }
    case "last-month":
      return { month: previousMonthKey() }
    case "last-3-months":
      return monthsAgoRange(3)
    case "last-6-months":
      return monthsAgoRange(6)
    case "year-to-date":
      return yearToDateRange()
    case "all-time":
      return {}
    case "custom-month":
      return period.month ? { month: period.month } : {}
    case "custom-range": {
      const query: DashboardPeriodQuery = {}
      if (period.from) {
        query.from = period.from
      }
      if (period.to) {
        query.to = period.to
      }
      return query
    }
  }
}

export function describePeriod(period: DashboardPeriod): string {
  switch (period.preset) {
    case "this-month":
      return formatMonthLabel(currentMonthKey())
    case "last-month":
      return formatMonthLabel(previousMonthKey())
    case "last-3-months":
    case "last-6-months":
    case "year-to-date": {
      const range = periodToQuery(period)
      return formatRangeLabel(range.from, range.to)
    }
    case "all-time":
      return "All time"
    case "custom-month":
      return period.month ? formatMonthLabel(period.month) : "Pick a month"
    case "custom-range":
      return formatRangeLabel(period.from, period.to)
  }
}

export function isCustomRangeInvalid(period: DashboardPeriod): boolean {
  if (period.preset !== "custom-range") {
    return false
  }
  if (!period.from || !period.to) {
    return false
  }
  return period.from > period.to
}

function monthsAgoRange(months: number): DashboardPeriodQuery {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1)
  return {
    from: toIsoDate(start),
    to: toIsoDate(now),
  }
}

function yearToDateRange(): DashboardPeriodQuery {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 1)
  return {
    from: toIsoDate(start),
    to: toIsoDate(now),
  }
}

function monthStartIso() {
  const now = new Date()
  return toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1))
}

function todayIso() {
  return toIsoDate(new Date())
}

function toIsoDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function formatMonthLabel(monthKey: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey)
  if (!match) {
    return monthKey
  }

  const year = Number(match[1])
  const monthIndex = Number(match[2]) - 1
  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, monthIndex, 1))
}

function formatRangeLabel(
  from: string | undefined,
  to: string | undefined,
): string {
  if (!from && !to) {
    return "All time"
  }
  const fromLabel = from ? formatDayLabel(from) : "Start"
  const toLabel = to ? formatDayLabel(to) : "Today"
  return `${fromLabel} \u2013 ${toLabel}`
}

function formatDayLabel(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) {
    return value
  }

  const year = Number(match[1])
  const monthIndex = Number(match[2]) - 1
  const day = Number(match[3])
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(year, monthIndex, day))
}
