const MISSING = "—"

const countFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })

export function formatCount(value: number | null): string {
  return value === null ? MISSING : countFormat.format(Math.round(value))
}

export function formatDecimal(value: number | null, digits = 1): string {
  return value === null ? MISSING : value.toFixed(digits)
}

/** A 0-1 ratio as a percentage, e.g. 0.742 -> "74.2%". */
export function formatPercent(ratio: number | null, digits = 1): string {
  return ratio === null ? MISSING : `${(ratio * 100).toFixed(digits)}%`
}

/** Euros with cents for small amounts (a cost per episode) and whole euros for totals. */
export function formatEuro(value: number | null): string {
  if (value === null) return MISSING
  return value < 10 ? `€${value.toFixed(2)}` : `€${countFormat.format(Math.round(value))}`
}

export function formatSeconds(seconds: number | null): string {
  if (seconds === null) return MISSING
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const whole = Math.round(seconds)
  return `${Math.floor(whole / 60)}m ${String(whole % 60).padStart(2, "0")}s`
}

export function formatMinutes(minutes: number | null): string {
  return minutes === null ? MISSING : `${minutes.toFixed(1)} min`
}

export type ChangeKind = "relative" | "points"

export interface Change {
  /** "+12.4%" for counts and amounts, "+1.5 pp" for rates. */
  text: string
  direction: "up" | "down" | "flat"
  tone: "good" | "bad" | "neutral"
}

/**
 * How `current` moved against `previous`. Counts and amounts change in percent, rates in percentage points.
 * `goodWhen` says which way is an improvement (lower latency and cost are). Null when there is nothing to compare.
 */
export function describeChange(current: number | null, previous: number | null, kind: ChangeKind, goodWhen: "up" | "down" = "up"): Change | null {
  if (current === null || previous === null) return null
  if (kind === "relative" && previous === 0) return null
  const amount = kind === "relative" ? ((current - previous) / previous) * 100 : (current - previous) * 100
  const rounded = Math.round(amount * 10) / 10
  const suffix = kind === "relative" ? "%" : " pp"
  if (rounded === 0) return { text: `0.0${suffix}`, direction: "flat", tone: "neutral" }
  const direction = rounded > 0 ? "up" : "down"
  return { text: `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(1)}${suffix}`, direction, tone: direction === goodWhen ? "good" : "bad" }
}

/** "Sep 3" from a YYYY-MM-DD day (UTC, so the label never slips a day with the viewer's time zone). */
export function formatShortDate(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
}

export function formatDateRange(startDay: string, endDay: string): string {
  return `${formatShortDate(startDay)} – ${formatShortDate(endDay)}`
}
