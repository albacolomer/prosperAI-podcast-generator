// Wall-clock time in an IANA timezone, with no library: Intl knows the zone rules (DST included), so the scheduler
// never adds "24 hours" to an instant and never trusts the browser's clock or offset.

export interface WallTime {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

export interface CalendarDate {
  year: number
  month: number
  day: number
}

const DAY_MS = 24 * 60 * 60 * 1000
const formatters = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    })
    formatters.set(timeZone, formatter)
  }
  return formatter
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatterFor(timeZone)
    return true
  } catch {
    return false
  }
}

/** The wall clock in `timeZone` at this instant. */
export function wallTimeIn(instant: Date, timeZone: string): WallTime {
  const parts: Record<string, number> = {}
  for (const { type, value } of formatterFor(timeZone).formatToParts(instant)) {
    if (type !== "literal") parts[type] = Number(value)
  }
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute }
}

const wallAsUtcMs = ({ year, month, day, hour, minute }: WallTime) => Date.UTC(year, month - 1, day, hour, minute)

/** The zone's offset from UTC (ms, east positive) at this instant. */
function offsetAt(ms: number, timeZone: string): number {
  return wallAsUtcMs(wallTimeIn(new Date(ms), timeZone)) - Math.floor(ms / 60_000) * 60_000
}

const sameWall = (a: WallTime, b: WallTime) => wallAsUtcMs(a) === wallAsUtcMs(b)

/**
 * The instant at which the wall clock in `timeZone` reads `wall`. An hour that happens twice (clocks going back) is the first
 * occurrence; an hour that never happens (clocks going forward) keeps the offset from before the jump, so 02:30 becomes 03:30.
 */
export function instantOfWallTime(wall: WallTime, timeZone: string): Date {
  const wallMs = wallAsUtcMs(wall)
  const before = offsetAt(wallMs - DAY_MS, timeZone)
  const after = offsetAt(wallMs + DAY_MS, timeZone)
  const valid = [...new Set([before, after])].map((offset) => wallMs - offset).filter((ms) => sameWall(wallTimeIn(new Date(ms), timeZone), wall))
  return new Date(valid.length > 0 ? Math.min(...valid) : wallMs - before)
}

/** The calendar day `days` after (or before) this one. Pure calendar arithmetic, so it does not care about DST. */
export function addDays({ year, month, day }: CalendarDate, days: number): CalendarDate {
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }
}

/** 0 = Sunday, as Date.getUTCDay. */
export function weekdayIndex({ year, month, day }: CalendarDate): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

/** `2026-09-21`: sorts and compares as a date. */
export function dateKey({ year, month, day }: CalendarDate): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

export function parseTime(time: string): { hour: number; minute: number } {
  const [hour, minute] = time.split(":").map(Number)
  return { hour, minute }
}
