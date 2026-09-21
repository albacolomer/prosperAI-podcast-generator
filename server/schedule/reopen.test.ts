import { mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createGenerationLock } from "../episode/generationLock.js"
import { happyDeps } from "../episode/testKit.js"
import { createSlotClaims } from "./claims.js"
import { at, config, runOf } from "./fixtures.js"
import { runScheduleTick } from "./runner.js"
import { handleReopenSlot } from "./reopen.js"
import { createScheduleStore } from "./store.js"
import type { ScheduleStore } from "./store.js"

let dir: string
let store: ScheduleStore
let claims: ReturnType<typeof createSlotClaims>

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "prosperpod-reopen-"))
  store = createScheduleStore(path.join(dir, "schedule.json"))
  claims = createSlotClaims(path.join(dir, "claims"))
})
afterEach(() => rm(dir, { recursive: true, force: true }))

const ENV = {
  GNEWS_API_KEY: "g",
  OPENAI_API_KEY: "o",
  TAVILY_API_KEY: "t",
  ELEVENLABS_API_KEY: "e",
  ELEVENLABS_VOICE_ID: "JBFqnCBsd6RMkjVDRZzb",
} as NodeJS.ProcessEnv

/** The state your project is in: a slot that failed at the old configuration check, before any provider was called. */
const failedBeforeAnything = () =>
  runOf({ status: "failed", attempts: 0, finishedAt: "2026-09-21T09:45:08.358Z", late: undefined, episodeId: undefined, error: { message: "Episode generation is not configured on the server.", retryable: false } })

const seed = (run = failedBeforeAnything()) => store.update((file) => ({ ...file, config: config(), run }))

const reopen = (body: unknown, extra: Partial<Parameters<typeof handleReopenSlot>[1]> = {}) =>
  handleReopenSlot(new Request("http://localhost/api/reopen-schedule-slot", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }), {
    store,
    lock: createGenerationLock(),
    claims,
    env: { NODE_ENV: "development" } as NodeJS.ProcessEnv,
    now: () => at("2026-09-21T09:50:00Z"),
    ...extra,
  })

describe("reopening a slot", () => {
  it("clears a run that failed before any provider was called, and changes nothing else", async () => {
    await seed()
    const before = (await store.read()).config

    const response = await reopen({ slotDate: "2026-09-21" })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ reopened: "2026-09-21", run: null, enabled: true })
    const after = await store.read()
    expect(after.run).toBeNull()
    expect(after.config).toEqual(before)
  })

  it("does not start anything by itself: the scheduler still has to find the slot due", async () => {
    await seed()
    const deps = happyDeps()

    await reopen({ slotDate: "2026-09-21" })

    for (const service of [deps.news.fetchCandidateArticles, deps.rank, deps.research, deps.script, deps.voice]) expect(service).not.toHaveBeenCalled()
    expect((await store.read()).run).toBeNull()
  })

  it("lets the next tick run the slot through the normal path, once the configuration is valid", async () => {
    await seed()
    await reopen({ slotDate: "2026-09-21" })
    const deps = happyDeps()
    const { onProgress: _p, signal: _s, log: _l, clock: _c, ...services } = deps

    const outcome = await runScheduleTick({ store, lock: createGenerationLock(), claims, env: ENV, createServices: () => services, now: () => at("2026-09-21T09:55:00Z"), log: () => {} })

    expect(outcome).toMatchObject({ status: "completed", slot: "2026-09-21T08:00", attempts: 1 })
    expect(deps.voice).toHaveBeenCalledTimes(1)
  })

  it("refuses a run that already started a pipeline, which would cost credits twice", async () => {
    for (const run of [
      runOf({ status: "failed", attempts: 1, error: { message: "x", retryable: false } }),
      runOf({ status: "failed", attempts: 2, error: { message: "x", retryable: true } }),
      runOf({ status: "completed" }),
    ]) {
      await seed(run)
      const response = await reopen({ slotDate: "2026-09-21" })

      expect(response.status).toBe(409)
      expect((await store.read()).run).toMatchObject({ slotDate: "2026-09-21", status: run.status })
    }
  })

  it("refuses a slot that is running, or that a live process holds", async () => {
    await seed(failedBeforeAnything())
    const lock = createGenerationLock()
    lock.tryAcquire("scheduled")
    expect((await reopen({ slotDate: "2026-09-21" }, { lock })).status).toBe(409)

    await createSlotClaims(path.join(dir, "claims")).tryClaim("2026-09-21")
    expect((await reopen({ slotDate: "2026-09-21" })).status).toBe(409)
    expect((await store.read()).run).not.toBeNull()
  })

  it("names the slot: a different date, or none, changes nothing", async () => {
    await seed()

    expect((await reopen({ slotDate: "2026-09-20" })).status).toBe(404)
    expect((await reopen({})).status).toBe(400)
    expect((await reopen({ slotDate: "yesterday" })).status).toBe(400)
    expect((await reopen("not json")).status).toBe(400)
    expect((await store.read()).run).not.toBeNull()
  })

  it("answers 404 in production", async () => {
    await seed()

    expect((await reopen({ slotDate: "2026-09-21" }, { env: { NODE_ENV: "production" } as NodeJS.ProcessEnv })).status).toBe(404)
    expect((await reopen({ slotDate: "2026-09-21" }, { env: { VERCEL: "1" } as NodeJS.ProcessEnv })).status).toBe(404)
    expect((await store.read()).run).not.toBeNull()
  })

  it("leaves no claim files behind", async () => {
    await seed()
    await reopen({ slotDate: "2026-09-21" })

    expect(await readdir(path.join(dir, "claims")).catch(() => [])).toEqual([])
  })

  it("is not called by anything at startup: reading the schedule leaves a failed run as it is", async () => {
    await seed()
    const spy = vi.spyOn(store, "update")

    await runScheduleTick({ store, lock: createGenerationLock(), claims, env: ENV, createServices: () => happyDeps(), now: () => at("2026-09-21T09:55:00Z"), log: () => {} })

    expect((await store.read()).run).toMatchObject({ status: "failed", attempts: 0 })
    expect(spy).not.toHaveBeenCalled()
  })
})
