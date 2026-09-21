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

/** "Tue, Sep 22, 8:00 AM", in the schedule's timezone. */
export const formatDeliveryIn = (iso: string, timeZone: string) =>
  formatIn(iso, timeZone, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })

/** Shown when someone tries to turn the schedule on with no interests selected. */
export const SCHEDULE_NEEDS_INTERESTS = "Add at least one interest to schedule episodes."

export interface ScheduleSummary {
  active: boolean
  /** "Every Monday" and the like. Undefined until a schedule has been saved. */
  frequency?: string
  /** "Tue, Sep 22, 8:00 AM"; undefined when nothing is upcoming. */
  nextDelivery?: string
  timeZone?: string
  /** Why an enabled schedule is not going to run, in words. */
  paused?: string
}

/** What the schedule is doing, from the server's point of view. */
export function summarizeSchedule(status: ScheduleStatus | null): ScheduleSummary {
  if (!status?.configured) return { active: false }
  const frequency = describeFrequency(status)
  if (!status.enabled) return { active: false, frequency, timeZone: status.timeZone }
  if (status.paused === "no-interests") {
    return { active: false, frequency, timeZone: status.timeZone, paused: "No interests selected. Your schedule is kept and resumes when you add an interest." }
  }
  return {
    active: true,
    frequency,
    timeZone: status.timeZone,
    nextDelivery: status.nextDeliveryAt ? formatDeliveryIn(status.nextDeliveryAt, status.timeZone) : undefined,
  }
}

/** A server setting that keeps the pending episode from starting. The slot is not lost: it starts by itself once the setting is fixed. */
export function describeConfigProblem(problem: { message: string } | null | undefined): { title: string; detail: string } | null {
  if (!problem) return null
  return { title: "Your scheduled episode is waiting on a server setting", detail: `${problem.message} It will start automatically once this is fixed, if the delivery is still within its 6-hour window.` }
}

export type RunNoticeKind = "running" | "completed" | "late" | "failed"

export interface RunNotice {
  kind: RunNoticeKind
  title: string
  detail: string
}

/** A finished run stays worth mentioning on Home for this long. */
const RECENT_MS = 24 * 60 * 60 * 1000

/** The latest scheduled run in plain words, with no internal detail. `null` when there is nothing to say. */
export function describeRun(run: ScheduleRunStatus | null | undefined): RunNotice | null {
  if (!run) return null
  const due = formatTimeIn(run.deliveryAt, run.timeZone)
  switch (run.status) {
    case "running":
      return run.attempts > 1
        ? { kind: "running", title: "Trying again to generate your scheduled episode", detail: `The first attempt didn't work, so we're trying once more. It was due at ${due}.` }
        : { kind: "running", title: "Generating your scheduled episode", detail: `It's due at ${due}. This may take a few minutes.` }
    case "completed": {
      const ready = run.finishedAt ? formatTimeIn(run.finishedAt, run.timeZone) : due
      return run.late
        ? { kind: "late", title: "Your scheduled episode arrived late", detail: `It was due at ${due} and was ready at ${ready}.` }
        : { kind: "completed", title: "Your scheduled episode is ready", detail: `Ready at ${ready} for the ${due} delivery.` }
    }
    case "failed":
      return {
        kind: "failed",
        title: "We couldn't generate your scheduled episode",
        detail: `${run.message ?? "Something went wrong."}${run.attempts > 1 ? " We tried twice." : ""}`,
      }
  }
}

/** Whether a notice deserves the banner on Home: something happening, something wrong, or something that just arrived late. */
export function isBannerWorthy(run: ScheduleRunStatus | null | undefined, now: number = Date.now()): boolean {
  if (!run) return false
  if (run.status === "running") return true
  const finished = run.finishedAt ? Date.parse(run.finishedAt) : Date.parse(run.startedAt)
  if (now - finished > RECENT_MS) return false
  return run.status === "failed" || run.late === true
}
