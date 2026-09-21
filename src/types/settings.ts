export const SCHEDULE_FREQUENCIES = ["daily", "weekly", "monthly"] as const
export type ScheduleFrequency = (typeof SCHEDULE_FREQUENCIES)[number]

/** Monday first, as the weekday picker lists them. */
export const DAYS_OF_WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const
export type DayOfWeek = (typeof DAYS_OF_WEEK)[number]

/** Days 29-31 do not exist in every month, so a monthly schedule cannot use them. */
export const MAX_DAY_OF_MONTH = 28

/** Editorial style of the script (not the voice, which controls the audio). */
export type Tone = "conversational" | "informative" | "storytelling" | "reassuring" | "journalistic" | "humorous"

export const MIN_DURATION_MINUTES = 5
export const MAX_DURATION_MINUTES = 60
/** Every generated episode is this long: what fits one ElevenLabs request. The Home page shows it but does not let the user change it. */
export const EPISODE_DURATION_MINUTES = 10

export interface PodcastSettings {
  language: string
  durationMinutes: number
  tone: Tone
  /** Whether the server generates episodes on the schedule below without anyone opening the app. */
  scheduleEnabled: boolean
  frequency: ScheduleFrequency
  /** Weekly: the day the episode is delivered. */
  weekday: DayOfWeek
  /** Monthly: the day of the month, 1 to MAX_DAY_OF_MONTH. */
  dayOfMonth: number
  /** The time (HH:MM) by which the episode should be ready. Generation starts a little earlier. */
  deliveryTime: string
}

export const DEFAULT_PODCAST_SETTINGS: PodcastSettings = {
  language: "en",
  durationMinutes: EPISODE_DURATION_MINUTES,
  tone: "conversational",
  scheduleEnabled: false,
  frequency: "daily",
  weekday: "mon",
  dayOfMonth: 1,
  deliveryTime: "08:00",
}
