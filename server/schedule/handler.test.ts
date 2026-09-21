import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { ScheduleStatus } from "../../src/types/schedule.js"
import { GET, PUT } from "../../api/schedule.js"
import { createGenerationLock } from "../episode/generationLock.js"
import { createSlotClaims } from "./claims.js"
import { at, config, runOf } from "./fixtures.js"
import { applySettings, handleGetSchedule, handlePutSchedule } from "./handler.js"
import { createScheduleStore } from "./store.js"
import type { ScheduleStore } from "./store.js"

let dir: string
let store: ScheduleStore
let claims: ReturnType<typeof createSlotClaims>

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "prosperpod-schedule-api-"))
  store = createScheduleStore(path.join(dir, "schedule.json"))
  claims = createSlotClaims(path.join(dir, "claims"))
})
afterEach(() => rm(dir, { recursive: true, force: true }))

const body = {
  enabled: true,
  frequency: "daily",
  deliveryTime: "08:00",
  weekday: "mon",
  dayOfMonth: 1,
  language: "en",
  tone: "conversational",
  interests: ["Artificial Intelligence"],
  timeZone: "Europe/Madrid",
}

const put = (change: Record<string, unknown> | string = {}, now = "2026-09-21T03:00:00Z") =>
  handlePutSchedule(new Request("http://localhost/api/schedule", { method: "PUT", body: typeof change === "string" ? change : JSON.stringify({ ...body, ...change }) }), {
    store,
    now: () => at(now),
  })
const get = (now = "2026-09-21T03:00:00Z", lock = createGenerationLock()) => handleGetSchedule({ store, lock, claims, now: () => at(now) })
const status = async (response: Response) => (await response.json()) as ScheduleStatus & Record<string, unknown>

describe("PUT /api/schedule", () => {
  it("saves the schedule and answers with what will happen next", async () => {
    const response = await put()
    const saved = await status(response)

    expect(response.status).toBe(200)
    expect(saved).toMatchObject({ configured: true, ...body, nextDeliveryAt: "2026-09-21T06:00:00.000Z", run: null })
    expect((await store.read()).config).toMatchObject(body)
  })

  it.each([
    ["the removed weekdays frequency", { frequency: "weekdays" }],
    ["day 29", { dayOfMonth: 29 }],
    ["an unknown timezone", { timeZone: "Nowhere/Land" }],
    ["a bad time", { deliveryTime: "8:00" }],
  ])("refuses %s without saving", async (_name, change) => {
    const response = await put(change)

    expect(response.status).toBe(400)
    expect(((await response.json()) as { error: string }).error).toBeTruthy()
    expect((await store.read()).config).toBeNull()
  })

  it("refuses a body that is not JSON, and one that is too large", async () => {
    expect((await put("not json")).status).toBe(400)
    expect((await put("x".repeat(10_001))).status).toBe(413)
  })

  it("keeps a schedule that is switched off stored, with nothing upcoming", async () => {
    await put({ enabled: false, frequency: "weekly", weekday: "fri" })

    const saved = await status(await get())
    expect(saved).toMatchObject({ configured: true, enabled: false, frequency: "weekly", weekday: "fri", nextDeliveryAt: null })
  })

  it("never starts an episode by itself", async () => {
    // A slot that is due right now: saving must only store, the scheduler is what generates.
    await put({}, "2026-09-21T05:50:00Z")

    expect((await store.read()).run).toBeNull()
  })

  it("reports the next delivery for weekly and monthly schedules", async () => {
    expect((await status(await put({ frequency: "weekly", weekday: "fri" }))).nextDeliveryAt).toBe("2026-09-25T06:00:00.000Z")
    expect((await status(await put({ frequency: "monthly", dayOfMonth: 28 }))).nextDeliveryAt).toBe("2026-09-28T06:00:00.000Z")
  })

  it("stores the browser's timezone and reads the delivery time in it", async () => {
    const saved = await status(await put({ timeZone: "America/New_York" }))

    expect(saved).toMatchObject({ timeZone: "America/New_York", nextDeliveryAt: "2026-09-21T12:00:00.000Z" })
  })
})

describe("interests", () => {
  it("refuses to switch the schedule on with no interests, and saves nothing", async () => {
    const response = await put({ enabled: true, interests: [] })

    expect(response.status).toBe(400)
    expect(((await response.json()) as { error: string }).error).toBe("Add at least one interest before turning on scheduled episodes.")
    expect((await store.read()).config).toBeNull()
  })

  it("refuses to switch it on with no interests when a switched-off schedule already exists, and keeps that schedule", async () => {
    await put({ enabled: false })

    expect((await put({ enabled: true, interests: [] })).status).toBe(400)
    expect((await store.read()).config).toMatchObject({ enabled: false, interests: ["Artificial Intelligence"] })
  })

  it("saves a switched-off schedule with no interests, as an empty list", async () => {
    const response = await put({ enabled: false, interests: [] })

    expect(response.status).toBe(200)
    expect((await store.read()).config).toMatchObject({ enabled: false, interests: [] })
    expect(await status(response)).toMatchObject({ enabled: false, interests: [], paused: null, nextDeliveryAt: null })
  })

  it("stores an empty list when the interests are removed from a schedule that is on, and keeps the schedule on and intact", async () => {
    await put({ frequency: "weekly", weekday: "fri", deliveryTime: "07:30" })

    const response = await put({ frequency: "weekly", weekday: "fri", deliveryTime: "07:30", interests: [] })
    const saved = await status(response)

    expect(response.status).toBe(200)
    expect((await store.read()).config).toMatchObject({ enabled: true, frequency: "weekly", weekday: "fri", deliveryTime: "07:30", timeZone: "Europe/Madrid", interests: [] })
    expect(saved).toMatchObject({ enabled: true, interests: [], paused: "no-interests", nextDeliveryAt: null })
  })

  it("does not re-arm the schedule when only the interests change, so the delivery slot is unaffected", async () => {
    await put({}, "2026-09-21T03:00:00Z")
    const armedAt = (await store.read()).config?.armedAt

    await put({ interests: [] }, "2026-09-21T09:00:00Z")
    await put({ interests: ["Space"] }, "2026-09-21T10:00:00Z")

    expect((await store.read()).config?.armedAt).toBe(armedAt)
  })

  it("resumes when an interest is added again: no longer paused, with a next delivery", async () => {
    await put({})
    await put({ interests: [] })
    expect(await status(await get())).toMatchObject({ paused: "no-interests", nextDeliveryAt: null })

    await put({ interests: ["Space"] })

    expect(await status(await get())).toMatchObject({ enabled: true, interests: ["Space"], paused: null, nextDeliveryAt: "2026-09-21T06:00:00.000Z" })
  })

  it("survives a restart: the empty list and the paused state are still there", async () => {
    await put({})
    await put({ interests: [] })

    const afterRestart = await handleGetSchedule({ store: createScheduleStore(path.join(dir, "schedule.json")), lock: createGenerationLock(), claims, now: () => at("2026-09-21T03:00:00Z") })

    expect(await status(afterRestart)).toMatchObject({ enabled: true, interests: [], paused: "no-interests" })
  })
})

describe("a server configuration problem", () => {
  it("is reported with the status, and is null when there is none", async () => {
    await put()
    expect(await status(await get())).toMatchObject({ configProblem: null })

    await store.update((file) => ({ ...file, problem: { message: "ELEVENLABS_VOICE_ID is not set on the server.", since: "2026-09-21T05:50:00.000Z" } }))

    expect(await status(await get())).toMatchObject({
      configProblem: { message: "ELEVENLABS_VOICE_ID is not set on the server.", since: "2026-09-21T05:50:00.000Z" },
      run: null,
    })
  })

  it("survives a saved schedule from before the note existed", async () => {
    await put()
    const { writeFile, readFile } = await import("node:fs/promises")
    const file = path.join(dir, "schedule.json")
    const saved = JSON.parse(await readFile(file, "utf8"))
    delete saved.problem
    await writeFile(file, JSON.stringify(saved))

    expect(await status(await get())).toMatchObject({ configured: true, configProblem: null })
  })
})

describe("re-arming", () => {
  const saved = (overrides = {}) => config({ armedAt: "2026-09-01T00:00:00.000Z", ...overrides })
  const settings = ({ armedAt: _armedAt, ...rest }: ReturnType<typeof config>) => rest

  it("re-arms when the schedule is first saved, switched on or its timing changes", () => {
    const now = at("2026-09-21T10:00:00Z")
    expect(applySettings(null, settings(saved()), now).armedAt).toBe(now.toISOString())
    expect(applySettings(saved({ enabled: false }), settings(saved()), now).armedAt).toBe(now.toISOString())
    expect(applySettings(saved(), settings(saved({ deliveryTime: "09:00" })), now).armedAt).toBe(now.toISOString())
    expect(applySettings(saved(), settings(saved({ frequency: "weekly" })), now).armedAt).toBe(now.toISOString())
    expect(applySettings(saved(), settings(saved({ weekday: "tue" })), now).armedAt).toBe(now.toISOString())
    expect(applySettings(saved(), settings(saved({ dayOfMonth: 2 })), now).armedAt).toBe(now.toISOString())
    expect(applySettings(saved(), settings(saved({ timeZone: "Asia/Tokyo" })), now).armedAt).toBe(now.toISOString())
  })

  it("keeps it when only the language, tone or interests change, so a missed slot is not lost by editing them", () => {
    const now = at("2026-09-21T10:00:00Z")
    expect(applySettings(saved(), settings(saved({ language: "es", tone: "humorous", interests: ["Space"] })), now).armedAt).toBe("2026-09-01T00:00:00.000Z")
  })
})

describe("GET /api/schedule", () => {
  it("answers 'not configured' before anything is saved", async () => {
    const response = await get()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ configured: false, enabled: false, nextDeliveryAt: null, run: null })
  })

  it("survives a restart: a new store over the same file gives the same answer", async () => {
    await put()
    const before = await status(await get())

    const afterRestart = await handleGetSchedule({ store: createScheduleStore(path.join(dir, "schedule.json")), lock: createGenerationLock(), claims, now: () => at("2026-09-21T03:00:00Z") })

    expect(await status(afterRestart)).toEqual(before)
  })

  it("reports the latest scheduled run in words, without internal fields", async () => {
    await put()
    await store.update((file) => ({
      ...file,
      run: runOf({ status: "failed", attempts: 2, finishedAt: "2026-09-21T06:05:00.000Z", late: undefined, episodeId: undefined, error: { message: "We couldn't select stories for this episode.", retryable: true } }),
    }))

    const { run, ...rest } = await status(await get("2026-09-21T07:00:00Z"))

    expect(run).toEqual({
      status: "failed",
      deliveryAt: "2026-09-21T06:00:00.000Z",
      timeZone: "Europe/Madrid",
      attempts: 2,
      startedAt: "2026-09-21T05:45:00.000Z",
      finishedAt: "2026-09-21T06:05:00.000Z",
      message: "We couldn't select stories for this episode.",
    })
    expect(JSON.stringify({ run, ...rest })).not.toMatch(/armedAt|stack|retryable/)
  })

  it("closes a run left 'running' by a restart, so the page never shows a generation that is not happening", async () => {
    await put()
    await store.update((file) => ({ ...file, run: runOf({ status: "running", finishedAt: undefined, late: undefined, episodeId: undefined }) }))

    const { run } = await status(await get("2026-09-21T05:55:00Z"))

    expect(run).toMatchObject({ status: "failed", message: expect.stringContaining("restarted") })
  })

  it("keeps showing a run that this process is really running", async () => {
    await put()
    await store.update((file) => ({ ...file, run: runOf({ status: "running", finishedAt: undefined, late: undefined, episodeId: undefined }) }))
    const lock = createGenerationLock()
    lock.tryAcquire("scheduled")

    const { run } = await status(await get("2026-09-21T05:55:00Z", lock))

    expect(run).toMatchObject({ status: "running", attempts: 1 })
  })

  it("does not offer the slot that was just claimed as the next delivery", async () => {
    await put()
    await store.update((file) => ({ ...file, run: runOf({ status: "running", finishedAt: undefined, late: undefined, episodeId: undefined }) }))
    const lock = createGenerationLock()
    lock.tryAcquire("scheduled")

    expect((await status(await get("2026-09-21T05:55:00Z", lock))).nextDeliveryAt).toBe("2026-09-22T06:00:00.000Z")
  })
})

describe("the real endpoint", () => {
  it("is wired to the same handlers", () => {
    expect(typeof GET).toBe("function")
    expect(typeof PUT).toBe("function")
  })
})
