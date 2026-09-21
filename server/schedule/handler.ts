import type { ScheduleRunStatus, ScheduleStatus } from "../../src/types/schedule.js"
import { generationLock } from "../episode/generationLock.js"
import type { GenerationLock } from "../episode/generationLock.js"
import { createSlotClaims } from "./claims.js"
import type { SlotClaims } from "./claims.js"
import { nextDelivery } from "./due.js"
import { parseScheduleRequest } from "./request.js"
import { recoverInterruptedRun } from "./runner.js"
import { createScheduleStore } from "./store.js"
import type { ScheduleStore } from "./store.js"
import type { RunRecord, ScheduleConfig, ScheduleFile, ScheduleSettings } from "./types.js"

const MAX_BODY_CHARS = 10_000

export const NEEDS_INTERESTS_MESSAGE = "Add at least one interest before turning on scheduled episodes."

/** A change the schedule refuses on its merits (as opposed to a body that is malformed). */
class ScheduleRefusal extends Error {}

interface HandlerConfig {
  store?: ScheduleStore
  lock?: GenerationLock
  claims?: SlotClaims
  now?: () => Date
}

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } })

function publicRun({ status, deliveryAt, timeZone, attempts, startedAt, finishedAt, late, episodeId, error }: RunRecord): ScheduleRunStatus {
  return { status, deliveryAt, timeZone, attempts, startedAt, finishedAt, late, episodeId, message: error?.message }
}

export function scheduleStatus({ config, run, problem }: ScheduleFile, now: Date): ScheduleStatus {
  if (!config) return { configured: false, enabled: false, nextDeliveryAt: null, run: null }
  const { armedAt: _armedAt, ...settings } = config
  return {
    configured: true,
    ...settings,
    nextDeliveryAt: nextDelivery(config, run, now)?.deliveryAt.toISOString() ?? null,
    run: run ? publicRun(run) : null,
    paused: config.enabled && config.interests.length === 0 ? "no-interests" : null,
    configProblem: problem,
  }
}

/** The schedule is re-armed (slots before this moment never run) when it is switched on or its timing changes, not when only the language, tone or interests do. */
export function applySettings(previous: ScheduleConfig | null, settings: ScheduleSettings, now: Date): ScheduleConfig {
  const timingChanged =
    previous === null ||
    !previous.enabled ||
    previous.frequency !== settings.frequency ||
    previous.deliveryTime !== settings.deliveryTime ||
    previous.weekday !== settings.weekday ||
    previous.dayOfMonth !== settings.dayOfMonth ||
    previous.timeZone !== settings.timeZone
  return { ...settings, armedAt: timingChanged ? now.toISOString() : previous.armedAt }
}

/** GET /api/schedule: what is scheduled, when the next episode is due and how the latest scheduled run went. Read-only; it calls no provider. */
export async function handleGetSchedule({ store = createScheduleStore(), lock = generationLock, claims = createSlotClaims(), now = () => new Date() }: HandlerConfig = {}): Promise<Response> {
  try {
    await recoverInterruptedRun({ store, lock, claims, now })
    return json(scheduleStatus(await store.read(), now()))
  } catch (error) {
    console.error("[Schedule] Could not read the schedule", error instanceof Error ? error.name : "unknown error")
    return json({ error: "The schedule could not be read" }, 500)
  }
}

/**
 * PUT /api/schedule. Body: the whole schedule (see scheduleSettingsSchema). Saves it and answers with the new status.
 * Saving never starts an episode by itself: the scheduler does that when a slot comes due, and only while `enabled` is true.
 */
export async function handlePutSchedule(request: Request, { store = createScheduleStore(), now = () => new Date() }: HandlerConfig = {}): Promise<Response> {
  const text = await request.text()
  if (text.length > MAX_BODY_CHARS) return json({ error: "Request body is too large" }, 413)

  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return json({ error: "Request body must be valid JSON" }, 400)
  }
  const parsed = parseScheduleRequest(body)
  if (!parsed.ok) return json({ error: parsed.message }, 400)

  try {
    const saved = await store.update((file) => {
      // Switching the schedule on needs something to make episodes from. A schedule that is already on may lose its interests
      // (the user removed them): that is kept as it is, paused, and not turned off.
      if (parsed.settings.enabled && parsed.settings.interests.length === 0 && !file.config?.enabled) throw new ScheduleRefusal(NEEDS_INTERESTS_MESSAGE)
      return { ...file, config: applySettings(file.config, parsed.settings, now()) }
    })
    return json(scheduleStatus(saved, now()))
  } catch (error) {
    if (error instanceof ScheduleRefusal) return json({ error: error.message }, 400)
    console.error("[Schedule] Could not save the schedule", error instanceof Error ? error.name : "unknown error")
    return json({ error: "The schedule could not be saved" }, 500)
  }
}
