import type { PodcastSettings, ScheduleSettingsPayload, ScheduleStatus } from "@/types"

/** The timezone the browser is in, which the server reads the delivery time in. */
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
}

/** What the server needs to run the schedule without the browser: the schedule itself plus what an episode is made from. */
export function buildSchedulePayload(settings: PodcastSettings, interests: string[], timeZone: string = browserTimeZone()): ScheduleSettingsPayload {
  return {
    enabled: settings.scheduleEnabled,
    frequency: settings.frequency,
    deliveryTime: settings.deliveryTime,
    weekday: settings.weekday,
    dayOfMonth: settings.dayOfMonth,
    language: settings.language,
    tone: settings.tone,
    interests,
    timeZone,
  }
}

/** The payload that changes only the interests of the schedule the server already holds. */
export function withInterests(status: Extract<ScheduleStatus, { configured: true }>, interests: string[], timeZone: string = browserTimeZone()): ScheduleSettingsPayload {
  const { enabled, frequency, deliveryTime, weekday, dayOfMonth, language, tone } = status
  return { enabled, frequency, deliveryTime, weekday, dayOfMonth, language, tone, interests, timeZone }
}

/**
 * The interests to send to the server so it never keeps stale ones, or `null` when there is nothing to send. An empty selection
 * is sent like any other: a schedule must not keep generating from interests the user has removed. Nothing is sent when the
 * server has no schedule yet (the first Save carries the interests), when it already holds exactly these, or when this exact
 * set was already tried (a set the server refused is not resent on every poll).
 */
export function interestsToSync(status: ScheduleStatus | null, selected: string[], lastTried: string | undefined): string[] | null {
  if (!status?.configured) return null
  const key = JSON.stringify(selected)
  if (key === JSON.stringify(status.interests) || key === lastTried) return null
  return selected
}

const isScheduleStatus = (value: unknown): value is ScheduleStatus =>
  typeof value === "object" && value !== null && typeof (value as { configured?: unknown }).configured === "boolean"

/** The schedule the server holds (GET /api/schedule). Rejects when it cannot be read. */
export async function fetchSchedule(signal?: AbortSignal): Promise<ScheduleStatus> {
  const response = await fetch("/api/schedule", { signal })
  if (!response.ok) throw new Error(`The schedule request failed (${response.status})`)
  const body: unknown = await response.json()
  if (!isScheduleStatus(body)) throw new Error("The schedule response was not understood")
  return body
}

/** Saves the schedule on the server (PUT /api/schedule) and resolves with what it now holds. Saving never starts an episode. */
export async function saveSchedule(payload: ScheduleSettingsPayload, signal?: AbortSignal): Promise<ScheduleStatus> {
  const response = await fetch("/api/schedule", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? `The schedule could not be saved (${response.status})`)
  }
  const body: unknown = await response.json()
  if (!isScheduleStatus(body)) throw new Error("The schedule response was not understood")
  return body
}
