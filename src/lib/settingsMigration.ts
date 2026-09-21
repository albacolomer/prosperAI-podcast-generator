import { DAYS_OF_WEEK, DEFAULT_PODCAST_SETTINGS, EPISODE_DURATION_MINUTES, MAX_DAY_OF_MONTH, SCHEDULE_FREQUENCIES } from "@/types"
import type { DayOfWeek, PodcastSettings, ScheduleFrequency } from "@/types"

/** The day of the week in the user's own timezone: Monday-first, as the schedule lists days. */
export function currentWeekday(date: Date = new Date()): DayOfWeek {
  return DAYS_OF_WEEK[(date.getDay() + 6) % 7]
}

const isFrequency = (value: unknown): value is ScheduleFrequency => SCHEDULE_FREQUENCIES.includes(value as ScheduleFrequency)
const isWeekday = (value: unknown): value is DayOfWeek => DAYS_OF_WEEK.includes(value as DayOfWeek)
const isDayOfMonth = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 1 && (value as number) <= MAX_DAY_OF_MONTH
const isTime = (value: unknown): value is string => typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)

/**
 * Settings as an older version saved them. Fields that no longer exist are dropped (the voice, custom days), a frequency that
 * no longer exists ("weekdays", "custom") becomes daily, and the weekday a weekly schedule starts on is today's, so choosing
 * Weekly for the first time is already a real, explicit day.
 */
export function normalizeSettings(stored: unknown, today: DayOfWeek = currentWeekday()): PodcastSettings {
  const saved = (typeof stored === "object" && stored !== null ? stored : {}) as Record<string, unknown>
  const defaults = DEFAULT_PODCAST_SETTINGS
  return {
    language: typeof saved.language === "string" ? saved.language : defaults.language,
    // The duration used to be editable; it is fixed now, so whatever was saved is replaced.
    durationMinutes: EPISODE_DURATION_MINUTES,
    tone: (typeof saved.tone === "string" ? saved.tone : defaults.tone) as PodcastSettings["tone"],
    scheduleEnabled: saved.scheduleEnabled === true,
    frequency: isFrequency(saved.frequency) ? saved.frequency : defaults.frequency,
    weekday: isWeekday(saved.weekday) ? saved.weekday : today,
    dayOfMonth: isDayOfMonth(saved.dayOfMonth) ? saved.dayOfMonth : defaults.dayOfMonth,
    deliveryTime: isTime(saved.deliveryTime) ? saved.deliveryTime : defaults.deliveryTime,
  }
}
