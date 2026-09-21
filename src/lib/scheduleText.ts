import { MAX_DAY_OF_MONTH } from "@/types"
import type { DayOfWeek, ScheduleFrequency, ScheduleRunStatus, ScheduleStatus } from "@/types"

export const WEEKDAY_NAMES: Record<DayOfWeek, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
}

/** 1 -> 1st, 22 -> 22nd, 11 -> 11th. */
export function ordinal(day: number): string {
  const teen = day % 100
  if (teen >= 11 && teen <= 13) return `${day}th`
  return `${day}${{ 1: "st", 2: "nd", 3: "rd" }[day % 10] ?? "th"}`
}

/** The days a monthly schedule can use: 1st to 28th, since 29-31 do not exist in every month. */
export const DAY_OF_MONTH_OPTIONS: { value: number; label: string }[] = Array.from({ length: MAX_DAY_OF_MONTH }, (_, index) => ({
  value: index + 1,
  label: ordinal(index + 1),
}))

/** "Every day", "Every Monday", "Monthly on the 15th". */
export function describeFrequency({ frequency, weekday, dayOfMonth }: { frequency: ScheduleFrequency; weekday: DayOfWeek; dayOfMonth: number }): string {
  switch (frequency) {
    case "daily":
      return "Every day"
    case "weekly":
      return `Every ${WEEKDAY_NAMES[weekday]}`
    case "monthly":
      return `Monthly on the ${ordinal(dayOfMonth)}`
  }
}

function formatIn(iso: string, timeZone: string, options: Intl.DateTimeFormatOptions): string {
  let text: string
  try {
    text = new Intl.DateTimeFormat("en-US", { timeZone, ...options }).format(new Date(iso))
  } catch {
    // An unknown zone name: fall back to the viewer's own.
    text = new Intl.DateTimeFormat("en-US", options).format(new Date(iso))
  }
  // Recent ICU puts a narrow no-break space before AM/PM; an ordinary space reads (and compares) the same.
  return text.replace(/\s+/g, " ")
}

/** "8:00 AM", in the schedule's timezone. */
export const formatTimeIn = (iso: string, timeZone: string) => formatIn(iso, timeZone, { hour: "numeric", minute: "2-digit" })

/** Shown when someone tries to turn the schedule on with no interests selected. */
export const SCHEDULE_NEEDS_INTERESTS = "Add at least one interest to schedule episodes."

/** "2026-09-22" for the calendar day `date` falls on in `timeZone`. */
function dayKey(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date)
  } catch {
    return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date)
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * When the next podcast is due, the way a person says it: "Today, 8:00 AM", "Tomorrow, 8:00 AM", "Monday, 8:00 AM" within
 * the coming week and "Oct 15, 8:00 AM" beyond it. Days are counted in the schedule's timezone.
 */
export function formatNextEpisode(iso: string, timeZone: string, now: number = Date.now()): string {
  const time = formatTimeIn(iso, timeZone)
  const days = Math.round((Date.parse(`${dayKey(new Date(iso), timeZone)}T00:00:00Z`) - Date.parse(`${dayKey(new Date(now), timeZone)}T00:00:00Z`)) / DAY_MS)
  if (days <= 0) return `Today, ${time}`
  if (days === 1) return `Tomorrow, ${time}`
  if (days <= 7) return `${formatIn(iso, timeZone, { weekday: "long" })}, ${time}`
  return `${formatIn(iso, timeZone, { month: "short", day: "numeric" })}, ${time}`
}

export interface ScheduleSummary {
  active: boolean
  /** "Every Monday" and the like. Undefined until a schedule has been saved. */
  frequency?: string
  /** "Tomorrow, 8:00 AM"; undefined when nothing is upcoming. */
  nextDelivery?: string
  /** Why an enabled schedule is not going to run, in words. */
  paused?: string
}

/** What the schedule is doing, from the server's point of view. Only an enabled schedule has anything to report. */
export function summarizeSchedule(status: ScheduleStatus | null, now: number = Date.now()): ScheduleSummary {
  if (!status?.configured || !status.enabled) return { active: false }
  const frequency = describeFrequency(status)
  if (status.paused === "no-interests") {
    return { active: false, frequency, paused: "No interests selected. It resumes when you add an interest." }
  }
  return {
    active: true,
    frequency,
    nextDelivery: status.nextDeliveryAt ? formatNextEpisode(status.nextDeliveryAt, status.timeZone, now) : undefined,
  }
}

/** A server setting that keeps the pending episode from starting. The slot is not lost: it starts by itself once the setting is fixed. */
export function describeConfigProblem(problem: { message: string } | null | undefined): { title: string; detail: string } | null {
  if (!problem) return null
  return { title: "Your scheduled episode is waiting on a server setting", detail: `${problem.message} It will start automatically once this is fixed, if the delivery is still within its 6-hour window.` }
}

export type RunNoticeKind = "running" | "failed"

export interface RunNotice {
  kind: RunNoticeKind
  title: string
  detail?: string
}

/** A failed run stays worth mentioning on Home for this long. */
const RECENT_MS = 24 * 60 * 60 * 1000

/**
 * The latest scheduled run in plain words, with no internal detail. `null` when there is nothing to say: a run that finished
 * has produced an episode, and how long it took is of no use once the episode is there, so it is not announced (late or not).
 */
export function describeRun(run: ScheduleRunStatus | null | undefined): RunNotice | null {
  if (!run) return null
  switch (run.status) {
    case "running":
      // A retry is the scheduler's business: the listener only needs to know a podcast is on its way.
      return { kind: "running", title: "Working on your new podcast, it will be ready soon." }
    case "completed":
      return null
    case "failed":
      return {
        kind: "failed",
        title: "We couldn't generate your scheduled podcast",
        detail: `${run.message ?? "Something went wrong."}${run.attempts > 1 ? " We tried twice." : ""}`,
      }
  }
}

/** Whether a notice deserves the banner on Home: a podcast being made now, or a recent failure. */
export function isBannerWorthy(run: ScheduleRunStatus | null | undefined, now: number = Date.now()): boolean {
  if (!run) return false
  if (run.status === "running") return true
  const finished = run.finishedAt ? Date.parse(run.finishedAt) : Date.parse(run.startedAt)
  if (now - finished > RECENT_MS) return false
  return run.status === "failed"
}
