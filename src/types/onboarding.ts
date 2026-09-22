import { currentWeekday } from "@/lib/settingsMigration"
import type { DayOfWeek, PodcastSettings, ScheduleFrequency, Tone } from "./settings"

export type OnboardingSchedule = Pick<PodcastSettings, "frequency" | "weekday" | "dayOfMonth" | "deliveryTime">

export interface OnboardingAnswers {
  interests: string[]
  language: string
  tone: Tone
  duration: number
  schedule: OnboardingSchedule
}

export const MIN_ONBOARDING_INTERESTS = 3
export const MAX_ONBOARDING_INTERESTS = 5

export function defaultOnboardingAnswers(): OnboardingAnswers {
  return {
    interests: [],
    language: "en",
    tone: "conversational",
    duration: 10,
    schedule: { frequency: "daily" as ScheduleFrequency, weekday: currentWeekday() as DayOfWeek, dayOfMonth: 1, deliveryTime: "08:00" },
  }
}
