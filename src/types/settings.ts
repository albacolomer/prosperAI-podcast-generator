export type ScheduleFrequency = "daily" | "weekdays" | "weekly" | "custom"

export type DayOfWeek = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"

/** Editorial style of the script (not the voice, which controls the audio). */
export type Tone = "conversational" | "informative" | "storytelling" | "reassuring" | "journalistic" | "humorous"

export const MIN_DURATION_MINUTES = 5
export const MAX_DURATION_MINUTES = 60

export interface PodcastSettings {
  language: string
  durationMinutes: number
  tone: Tone
  voiceId: string
  frequency: ScheduleFrequency
  customDays: DayOfWeek[]
  deliveryTime: string
}

export const DEFAULT_PODCAST_SETTINGS: PodcastSettings = {
  language: "en",
  durationMinutes: 10,
  tone: "conversational",
  voiceId: "nova",
  frequency: "daily",
  customDays: [],
  deliveryTime: "08:00",
}
