import { z } from "zod"
import { LANGUAGE_CODES, TONE_IDS } from "../script/options.js"
import { isValidTimeZone } from "./time.js"

// Server-side copies of the client's schedule options (src/types/settings.ts); schedule.test.ts fails if they drift apart.
export const SCHEDULE_FREQUENCIES = ["daily", "weekly", "monthly"] as const
export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const
/** Days 29-31 do not exist in every month, so a monthly schedule cannot use them. */
export const MAX_DAY_OF_MONTH = 28

export type ScheduleFrequency = (typeof SCHEDULE_FREQUENCIES)[number]
export type Weekday = (typeof WEEKDAYS)[number]

export const MAX_INTERESTS = 10
export const MAX_INTEREST_LENGTH = 60

const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "must be HH:MM")
const isoInstant = z.string().refine((value) => !Number.isNaN(Date.parse(value)))

/** What the user sets: the body of PUT /api/schedule. The voice and the length are server matters, as for a manual episode. */
export const scheduleSettingsSchema = z.object({
  enabled: z.boolean(),
  frequency: z.enum(SCHEDULE_FREQUENCIES),
  deliveryTime: timeOfDay,
  weekday: z.enum(WEEKDAYS),
  dayOfMonth: z.number().int().min(1).max(MAX_DAY_OF_MONTH),
  language: z.enum(LANGUAGE_CODES),
  tone: z.enum(TONE_IDS),
  // May be empty (the user deselected everything): the schedule then waits instead of failing.
  interests: z.array(z.string().trim().min(1).max(MAX_INTEREST_LENGTH)).max(MAX_INTERESTS),
  timeZone: z.string().min(1).max(64).refine(isValidTimeZone, "must be an IANA timezone such as Europe/Madrid"),
})

export type ScheduleSettings = z.infer<typeof scheduleSettingsSchema>

/** The saved schedule. `armedAt` is when it was last switched on or its timing last changed: slots before that are never run. */
export const scheduleConfigSchema = scheduleSettingsSchema.extend({ armedAt: isoInstant })
export type ScheduleConfig = z.infer<typeof scheduleConfigSchema>

export const RUN_STATUSES = ["running", "completed", "failed"] as const
export type RunStatus = (typeof RUN_STATUSES)[number]

/**
 * One scheduled delivery slot and what became of it. Writing this record is the claim: from then on the slot can never be
 * started again, which is what keeps a restart, a second tick or a changed delivery time from producing a second episode.
 */
export const runRecordSchema = z.object({
  /** `2026-09-21T08:00`: the delivery slot in the schedule's own timezone. */
  slot: z.string(),
  /** `2026-09-21`: the local calendar day of the slot. At most one slot is ever claimed per day. */
  slotDate: z.string(),
  timeZone: z.string(),
  /** When the episode is due (ISO instant). */
  deliveryAt: isoInstant,
  status: z.enum(RUN_STATUSES),
  /** Full pipeline attempts started for this slot: never more than MAX_SCHEDULED_ATTEMPTS. */
  attempts: z.number().int().min(0),
  startedAt: isoInstant,
  finishedAt: isoInstant.optional(),
  /** Completed after the delivery time. */
  late: z.boolean().optional(),
  episodeId: z.string().optional(),
  /** Safe, user-facing: never a stack trace, a provider body or a validator detail. */
  error: z.object({ message: z.string(), retryable: z.boolean() }).optional(),
})

export type RunRecord = z.infer<typeof runRecordSchema>

/**
 * A server configuration problem that is keeping the pending slot from starting (a missing key, a bad voice id). It is only a
 * note for the user: the slot is NOT claimed, and the next look at the schedule checks the configuration again.
 */
export const configProblemSchema = z.object({ message: z.string(), since: isoInstant })
export type ConfigProblem = z.infer<typeof configProblemSchema>

export const scheduleFileSchema = z.object({
  version: z.literal(1),
  config: scheduleConfigSchema.nullable(),
  run: runRecordSchema.nullable(),
  // Absent in files written before this existed.
  problem: configProblemSchema.nullable().default(null),
})

export type ScheduleFile = z.infer<typeof scheduleFileSchema>

export const EMPTY_SCHEDULE_FILE: ScheduleFile = { version: 1, config: null, run: null, problem: null }
