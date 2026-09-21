import { z } from "zod"
import { generationLock } from "../episode/generationLock.js"
import type { GenerationLock } from "../episode/generationLock.js"
import { createSlotClaims } from "./claims.js"
import type { SlotClaims } from "./claims.js"
import { scheduleStatus } from "./handler.js"
import { createScheduleStore } from "./store.js"
import type { ScheduleStore } from "./store.js"

const bodySchema = z.object({ slotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })

interface ReopenConfig {
  store?: ScheduleStore
  lock?: GenerationLock
  claims?: SlotClaims
  env?: NodeJS.ProcessEnv
  now?: () => Date
}

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } })

/**
 * POST /api/reopen-schedule-slot   Body: { "slotDate": "2026-09-21" }
 * Development and testing only. Makes one delivery slot startable again, and does nothing else: the scheduler still has to
 * find it due, so it runs only within its normal window and through the normal claim. It refuses (409) anything that could
 * cost credits twice: a slot that is running, that another process holds, or whose run already started a pipeline (only a
 * run that failed with 0 attempts, i.e. before any provider was called, can be reopened). Nothing calls this by itself.
 */
export async function handleReopenSlot(
  request: Request,
  { store = createScheduleStore(), lock = generationLock, claims = createSlotClaims(), env = process.env, now = () => new Date() }: ReopenConfig = {},
): Promise<Response> {
  if (env.NODE_ENV === "production" || env.VERCEL) return json({ error: "Not found" }, 404)

  let body: unknown
  try {
    body = JSON.parse(await request.text())
  } catch {
    return json({ error: "Request body must be valid JSON" }, 400)
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return json({ error: 'Body must be { "slotDate": "YYYY-MM-DD" }' }, 400)
  const { slotDate } = parsed.data

  const { run } = await store.read()
  if (!run || run.slotDate !== slotDate) return json({ error: `The saved run is not for ${slotDate}` }, 404)
  if (run.status !== "failed" || run.attempts !== 0) {
    return json({ error: "Only a run that failed before any provider was called (0 attempts) can be reopened; this one is " + `${run.status} after ${run.attempts} attempt(s)` }, 409)
  }
  if (lock.owner() === "scheduled" || (await claims.inspect(slotDate)) === "live") {
    return json({ error: "The slot is being handled by a running scheduler" }, 409)
  }

  const saved = await store.update((file) =>
    file.run?.slotDate === slotDate && file.run.status === "failed" && file.run.attempts === 0 ? { ...file, run: null } : file,
  )
  await claims.pruneStale()
  return json({ reopened: slotDate, ...scheduleStatus(saved, now()) })
}
