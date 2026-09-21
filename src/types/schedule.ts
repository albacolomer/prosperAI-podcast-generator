import type { DayOfWeek, ScheduleFrequency, Tone } from "./settings.js"

export type ScheduleRunState = "running" | "completed" | "failed"

/** The latest scheduled slot and what became of it, as GET /api/schedule reports it. Nothing here is internal or a stack trace. */
export interface ScheduleRunStatus {
  status: ScheduleRunState
  /** When the episode was due (ISO instant). */
  deliveryAt: string
  timeZone: string
  /** Full attempts started for this slot (1 or 2). */
  attempts: number
  startedAt: string
  finishedAt?: string
  /** Completed after the delivery time. */
  late?: boolean
  episodeId?: string
  /** Why it failed, in words a listener can read. */
  message?: string
}

export interface ScheduleSettingsPayload {
  enabled: boolean
  frequency: ScheduleFrequency
  deliveryTime: string
  weekday: DayOfWeek
  dayOfMonth: number
  language: string
  tone: Tone
  interests: string[]
  /** IANA timezone the delivery time is read in, such as Europe/Madrid. */
  timeZone: string
}

/** GET /api/schedule and the answer to PUT /api/schedule: what the server holds and what it will do next. */
export type ScheduleStatus = ({ configured: true } & ScheduleSettingsPayload & {
  nextDeliveryAt: string | null
  run: ScheduleRunStatus | null
  /** Why an enabled schedule is not going to run: it has no interests to make an episode from. The configuration is kept, and it resumes when one is added. */
  paused: "no-interests" | null
  /** The server is not configured to run the pending episode (a setting it names is missing or invalid). The slot is still waiting: it starts once this is fixed. */
  configProblem?: { message: string; since: string } | null
}) | {
  configured: false
  enabled: false
  nextDeliveryAt: null
  run: null
}
