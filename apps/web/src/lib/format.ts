export function formatMoney(value: number | string | null | undefined) {
  const amount = Number(value ?? 0)

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "-"
  }

  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
  }).format(Number(value))
}

export function formatPercent(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "-"
  }

  return `${formatNumber(value)}%`
}

export function formatDate(value: string | null | undefined) {
  if (!value) {
    return "-"
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value))
}

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) {
    return "-"
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}
