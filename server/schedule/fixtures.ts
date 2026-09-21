import type { RunRecord, ScheduleConfig } from "./types.js"

/** A daily 08:00 schedule in Madrid (UTC+2 in September: 08:00 is 06:00Z, and generation starts at 05:45Z). Armed long before the tests' clock. */
export const config = (overrides: Partial<ScheduleConfig> = {}): ScheduleConfig => ({
  enabled: true,
  frequency: "daily",
  deliveryTime: "08:00",
  weekday: "mon",
  dayOfMonth: 1,
  language: "en",
  tone: "conversational",
  interests: ["Artificial Intelligence", "Formula 1"],
  timeZone: "Europe/Madrid",
  armedAt: "2026-09-01T00:00:00.000Z",
  ...overrides,
})

export const at = (iso: string) => new Date(iso)

/** The record left by a run of the given slot. */
export const runOf = (overrides: Partial<RunRecord> = {}): RunRecord => ({
  slot: "2026-09-21T08:00",
  slotDate: "2026-09-21",
  timeZone: "Europe/Madrid",
  deliveryAt: "2026-09-21T06:00:00.000Z",
  status: "completed",
  attempts: 1,
  startedAt: "2026-09-21T05:45:00.000Z",
  finishedAt: "2026-09-21T05:51:00.000Z",
  late: false,
  episodeId: "an-episode-0a1b2c3d",
  ...overrides,
})
