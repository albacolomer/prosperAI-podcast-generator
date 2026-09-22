import type { ScheduleFrequency } from "@/types"

/** Suggested interests shown during onboarding. A separate, shorter list than the full-app suggestions in suggestedInterests.ts. */
export const onboardingInterests: string[] = [
  "AI & Technology",
  "Startups",
  "Business",
  "Science",
  "Finance",
  "Economics",
  "World News",
  "Climate",
  "Health",
  "Culture",
  "Sports",
  "Travel",
  "Design",
  "Productivity",
  "Entertainment",
  "Gaming",
]

export interface DurationOption {
  minutes: number
  label: string
  tagline: string
  /** Shown after the user picks it, to connect the choice to the podcast that will be made. */
  resultNote: string
}

export const onboardingDurations: DurationOption[] = [
  { minutes: 5, label: "5 min", tagline: "Quick catch-up", resultNote: "Perfect for a quick catch-up." },
  { minutes: 10, label: "10 min", tagline: "Daily briefing", resultNote: "Perfect for a daily briefing." },
  { minutes: 20, label: "20 min", tagline: "Deep dive", resultNote: "Great for settling in for a deep dive." },
  { minutes: 30, label: "30+ min", tagline: "Give me the full story", resultNote: "We'll give you the full story." },
]

/** Same three values as SCHEDULE_FREQUENCIES in types/settings.ts — just labeled for the onboarding chip UI. */
export const onboardingFrequencies: { value: ScheduleFrequency; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
]
