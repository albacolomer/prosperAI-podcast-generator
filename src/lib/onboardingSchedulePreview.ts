import { browserTimeZone } from "@/lib/scheduleApi"
import { DAYS_OF_WEEK } from "@/types"
import type { PodcastSettings, ScheduleStatus } from "@/types"

type ScheduleFields = Pick<PodcastSettings, "frequency" | "weekday" | "dayOfMonth" | "deliveryTime">

function nextDeliveryDate(schedule: ScheduleFields, now = new Date()): Date {
  const [hours, minutes] = schedule.deliveryTime.split(":").map(Number)
  const next = new Date(now)
  next.setHours(hours, minutes, 0, 0)

  if (schedule.frequency === "daily") {
    if (next <= now) next.setDate(next.getDate() + 1)
    return next
  }

  if (schedule.frequency === "weekly") {
    const targetIndex = DAYS_OF_WEEK.indexOf(schedule.weekday)
    const currentIndex = (now.getDay() + 6) % 7
    let daysAhead = (targetIndex - currentIndex + 7) % 7
    if (daysAhead === 0 && next <= now) daysAhead = 7
    next.setDate(now.getDate() + daysAhead)
    return next
  }

  // monthly
  next.setDate(schedule.dayOfMonth)
  if (next <= now) next.setMonth(next.getMonth() + 1, schedule.dayOfMonth)
  return next
}

/**
 * A display-only stand-in for what GET /api/schedule would return, built entirely from local onboarding/demo state.
 * Never fetched or saved anywhere — it exists only so the simulated Home's schedule summary can appear in the same
 * top-right spot as the real Home, reflecting exactly what was picked.
 */
export function buildMockScheduleStatus(settings: PodcastSettings, interests: string[]): ScheduleStatus {
  return {
    configured: true,
    enabled: settings.scheduleEnabled,
    frequency: settings.frequency,
    deliveryTime: settings.deliveryTime,
    weekday: settings.weekday,
    dayOfMonth: settings.dayOfMonth,
    language: settings.language,
    tone: settings.tone,
    interests,
    timeZone: browserTimeZone(),
    nextDeliveryAt: nextDeliveryDate(settings).toISOString(),
    run: null,
    paused: interests.length === 0 ? "no-interests" : null,
    configProblem: null,
  }
}
