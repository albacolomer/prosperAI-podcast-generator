export type ScheduleFrequency = "daily" | "weekdays" | "weekly" | "custom"

export type DayOfWeek = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"

export interface PodcastSettings {
  language: string
  durationMinutes: number
  voiceId: string
  frequency: ScheduleFrequency
  customDays: DayOfWeek[]
  deliveryTime: string
}

export const DEFAULT_PODCAST_SETTINGS: PodcastSettings = {
  language: "en",
  durationMinutes: 10,
  voiceId: "nova",
  frequency: "daily",
  customDays: [],
  deliveryTime: "08:00",
}
