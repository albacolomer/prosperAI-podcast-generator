import { mkdtemp, readdir, rm, stat, utimes } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AudioError } from "../audio/errors.js"
import { createGenerationLock } from "../episode/generationLock.js"
import type { GenerationLock } from "../episode/generationLock.js"
import { handleGenerateEpisode } from "../episode/handler.js"
import { happyDeps, MP3, scriptResponse, validation } from "../episode/testKit.js"
import { RankingError } from "../ranking/errors.js"
import { createSlotClaims } from "./claims.js"
import type { SlotClaims } from "./claims.js"
import { at, config, runOf } from "./fixtures.js"
import { scheduleStatus } from "./handler.js"
import { runScheduleTick } from "./runner.js"
import type { SchedulerDeps, TickOutcome } from "./runner.js"
import { createScheduleStore } from "./store.js"
import type { ScheduleStore } from "./store.js"

const ENV = {
  GNEWS_API_KEY: "gnews-secret",
  OPENAI_API_KEY: "sk-secret-key",
  TAVILY_API_KEY: "tvly-secret",
  ELEVENLABS_API_KEY: "xi-secret-key",
  ELEVENLABS_VOICE_ID: "JBFqnCBsd6RMkjVDRZzb",
} as NodeJS.ProcessEnv

// 2026-09-21, Madrid: the daily 08:00 slot is due at 06:00Z and generation starts at 05:45Z.
const IN_LEAD = "2026-09-21T05:50:00Z"

let dir: string
let file: string
let store: ScheduleStore
let lock: GenerationLock
let claims: SlotClaims
let clock: Date

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "prosperpod-runner-"))
  file = path.join(dir, "schedule.json")
  store = createScheduleStore(file)
  lock = createGenerationLock()
  // Always in the temp directory: a test must never touch the real project's claims.
  claims = createSlotClaims(path.join(dir, "claims"))
  clock = at(IN_LEAD)
})
afterEach(async () => {
  vi.restoreAllMocks()
  await rm(dir, { recursive: true, force: true })
})

type Deps = ReturnType<typeof happyDeps>

const seed = (overrides = {}) => store.update((file) => ({ ...file, config: config(overrides) }))

/** Runs one tick with the real pipeline over stub services: no provider is ever reached. */
function tick(deps: Deps, extra: Partial<SchedulerDeps> = {}): Promise<TickOutcome> {
  const { onProgress: _p, signal: _s, log: _l, clock: _c, ...services } = deps
  return runScheduleTick({ store, lock, claims, env: ENV, createServices: () => services, now: () => clock, log: () => {}, ...extra })
}

const stored = async () => (await store.read()).run

describe("a slot that is due", () => {
  it("makes one full attempt and publishes the episode through the normal store", async () => {
    await seed()
    const deps = happyDeps()

    const outcome = await tick(deps)

    expect(outcome).toEqual({ status: "completed", slot: "2026-09-21T08:00", attempts: 1 })
    expect(deps.news.fetchCandidateArticles).toHaveBeenCalledTimes(1)
    expect(deps.voice).toHaveBeenCalledTimes(1)
    expect(deps.store.saved).toHaveLength(1)
    expect(deps.store.details).toHaveLength(1)
    expect(await stored()).toMatchObject({
      status: "completed",
      attempts: 1,
      slot: "2026-09-21T08:00",
      deliveryAt: "2026-09-21T06:00:00.000Z",
      timeZone: "Europe/Madrid",
      late: false,
      episodeId: "ai-chips-race-cars-your-briefing-0a1b2c3d",
    })
  })

  it("uses the saved interests, language and tone, and the fixed 9-minute length", async () => {
    await seed({ interests: ["Space"], language: "es", tone: "humorous" })
    const deps = happyDeps()

    await tick(deps)

    expect(deps.news.fetchCandidateArticles).toHaveBeenCalledWith({ interests: ["Space"] })
    expect(deps.script).toHaveBeenCalledWith(expect.objectContaining({ interests: ["Space"], language: "es", tone: "humorous", durationMinutes: 9 }), expect.anything())
  })

  it("does nothing before generation starts, and does not touch the services", async () => {
    await seed()
    clock = at("2026-09-21T05:40:00Z")
    const createServices = vi.fn()

    expect(await runScheduleTick({ store, lock, claims, env: ENV, createServices, now: () => clock, log: () => {} })).toEqual({ status: "idle" })
    expect(createServices).not.toHaveBeenCalled()
    expect(await stored()).toBeNull()
  })

  it("does nothing when there is no schedule yet", async () => {
    expect(await tick(happyDeps())).toEqual({ status: "no-schedule" })
  })

  it("does nothing when the schedule is switched off, and keeps its configuration", async () => {
    await seed({ enabled: false })
    const deps = happyDeps()

    expect(await tick(deps)).toEqual({ status: "idle" })
    expect(deps.news.fetchCandidateArticles).not.toHaveBeenCalled()
    expect((await store.read()).config).toMatchObject({ enabled: false, frequency: "daily", interests: ["Artificial Intelligence", "Formula 1"] })
  })

  it("marks an episode that finishes after the delivery time as late, and still publishes it", async () => {
    await seed()
    const deps = happyDeps({
      voice: vi.fn(async () => {
        clock = at("2026-09-21T06:12:00Z")
        return { audio: MP3, durationMs: 5 }
      }),
    })

    await tick(deps)

    expect(await stored()).toMatchObject({ status: "completed", late: true, finishedAt: "2026-09-21T06:12:00.000Z" })
    expect(deps.store.saved).toHaveLength(1)
  })

  it("claims the slot in the saved file before anything is spent", async () => {
    await seed()
    const deps = happyDeps()
    let midRun: Awaited<ReturnType<typeof stored>> = null
    const original = deps.news.fetchCandidateArticles
    deps.news.fetchCandidateArticles = vi.fn(async (options) => {
      midRun = (await createScheduleStore(file).read()).run
      return original(options)
    })

    await tick(deps)

    expect(midRun).toMatchObject({ status: "running", attempts: 1, slot: "2026-09-21T08:00", slotDate: "2026-09-21" })
  })
})

describe("a schedule with no interests", () => {
  it("never reaches the pipeline: no service is created, nothing is spent and no slot is claimed", async () => {
    await seed({ interests: [] })
    const createServices = vi.fn()

    const outcome = await runScheduleTick({ store, lock, claims, env: ENV, createServices, now: () => clock, log: () => {} })

    expect(outcome).toEqual({ status: "no-interests" })
    expect(createServices).not.toHaveBeenCalled()
    expect(await stored()).toBeNull()
    expect(lock.owner()).toBeUndefined()
  })

  it("stays that way on every tick, however long the slot has been due", async () => {
    await seed({ interests: [] })
    const deps = happyDeps()

    for (const time of ["2026-09-21T05:50:00Z", "2026-09-21T06:30:00Z", "2026-09-22T05:50:00Z"]) {
      clock = at(time)
      expect(await tick(deps)).toEqual({ status: "no-interests" })
    }

    for (const service of [deps.news.fetchCandidateArticles, deps.rank, deps.research, deps.script, deps.voice]) expect(service).not.toHaveBeenCalled()
    expect(deps.store.saved).toHaveLength(0)
  })

  it("is caught by the second look too, when the interests are removed after the first", async () => {
    await seed()
    const deps = happyDeps()
    // The user removes their interests in the moment between the scheduler noticing the slot and taking the lock:
    // every read of the schedule after the lock is taken sees no interests.
    let locked = false
    const realAcquire = lock.tryAcquire.bind(lock)
    lock.tryAcquire = (owner) => {
      locked = true
      return realAcquire(owner)
    }
    const removing: ScheduleStore = {
      ...store,
      read: async () => {
        const file = await store.read()
        return locked ? { ...file, config: file.config && { ...file.config, interests: [] } } : file
      },
    }

    expect(await tick(deps, { store: removing })).toEqual({ status: "no-interests" })
    expect(deps.news.fetchCandidateArticles).not.toHaveBeenCalled()
    expect(await stored()).toBeNull()
    expect(lock.owner()).toBeUndefined()
  })

  it("keeps the schedule intact: still on, same timing", async () => {
    await seed({ interests: [], frequency: "weekly", weekday: "mon", deliveryTime: "08:00" })
    clock = at("2026-09-21T05:50:00Z")
    await tick(happyDeps())

    expect((await store.read()).config).toMatchObject({ enabled: true, frequency: "weekly", weekday: "mon", deliveryTime: "08:00", interests: [] })
  })

  it("resumes when an interest is added: the due slot is generated as usual, with the new interests", async () => {
    await seed({ interests: [] })
    const deps = happyDeps()
    expect(await tick(deps)).toEqual({ status: "no-interests" })

    await store.update((file) => ({ ...file, config: file.config && { ...file.config, interests: ["Space"] } }))
    clock = at("2026-09-21T06:20:00Z") // still within 6 hours of the 08:00 slot

    expect(await tick(deps)).toMatchObject({ status: "completed", slot: "2026-09-21T08:00", attempts: 1 })
    expect(deps.news.fetchCandidateArticles).toHaveBeenCalledWith({ interests: ["Space"] })
    expect(await stored()).toMatchObject({ status: "completed", late: true })
  })

  it("does not affect a schedule that is switched off, which does nothing either way", async () => {
    await seed({ enabled: false, interests: [] })

    expect(await tick(happyDeps())).toEqual({ status: "idle" })
  })

  it("leaves manual generation alone: the lock is free for it", async () => {
    await seed({ interests: [] })
    await tick(happyDeps())

    expect(lock.tryAcquire("manual")).toBeTypeOf("function")
  })
})

describe("missed slots", () => {
  it("catches up once when the server comes back within 6 hours", async () => {
    await seed()
    clock = at("2026-09-21T08:30:00Z") // 10:30 in Madrid, for the 08:00 slot
    const deps = happyDeps()

    expect(await tick(deps)).toMatchObject({ status: "completed", slot: "2026-09-21T08:00" })
    expect(await stored()).toMatchObject({ late: true })
    expect(deps.voice).toHaveBeenCalledTimes(1)
  })

  it("skips a slot older than 6 hours", async () => {
    await seed()
    clock = at("2026-09-21T12:01:00Z")
    const deps = happyDeps()

    expect(await tick(deps)).toEqual({ status: "idle" })
    expect(deps.news.fetchCandidateArticles).not.toHaveBeenCalled()
  })

  it("generates one episode after days away, never a backlog", async () => {
    await seed({ armedAt: "2026-09-17T00:00:00.000Z" })
    clock = at("2026-09-21T06:30:00Z") // three daily slots were missed
    const deps = happyDeps()

    expect(await tick(deps)).toMatchObject({ status: "completed", slot: "2026-09-21T08:00" })
    expect(await tick(deps)).toEqual({ status: "idle" })
    expect(await tick(deps)).toEqual({ status: "idle" })
    expect(deps.voice).toHaveBeenCalledTimes(1)
  })

  it("does not run a slot from before the schedule was switched on", async () => {
    await seed({ armedAt: "2026-09-21T09:00:00.000Z" })
    clock = at("2026-09-21T09:30:00Z")

    expect(await tick(happyDeps())).toEqual({ status: "idle" })
  })
})

describe("retrying a scheduled episode", () => {
  it("makes a second full attempt after a retryable failure, and publishes it when that works", async () => {
    await seed()
    const base = happyDeps()
    const deps = happyDeps({ rank: vi.fn(base.rank).mockRejectedValueOnce(new RankingError("timeout", "The ranking request to OpenAI timed out")) })

    const outcome = await tick(deps)

    expect(outcome).toEqual({ status: "completed", slot: "2026-09-21T08:00", attempts: 2 })
    expect(deps.rank).toHaveBeenCalledTimes(2)
    // The whole pipeline ran again from the news.
    expect(deps.news.fetchCandidateArticles).toHaveBeenCalledTimes(2)
    expect(deps.voice).toHaveBeenCalledTimes(1)
    expect(deps.store.saved).toHaveLength(1)
    expect(await stored()).toMatchObject({ status: "completed", attempts: 2 })
  })

  it("stops after the second attempt fails, and records a failure a person can read", async () => {
    await seed()
    const deps = happyDeps({ rank: vi.fn(async () => Promise.reject(new RankingError("timeout", "The ranking request to OpenAI timed out"))) })

    const outcome = await tick(deps)

    expect(outcome).toEqual({ status: "failed", slot: "2026-09-21T08:00", attempts: 2 })
    expect(deps.rank).toHaveBeenCalledTimes(2)
    expect(deps.voice).not.toHaveBeenCalled()
    expect(deps.store.saved).toHaveLength(0)
    const run = await stored()
    expect(run).toMatchObject({ status: "failed", attempts: 2, error: { message: "We couldn't select stories for this episode.", retryable: true } })
    expect(JSON.stringify(run)).not.toMatch(/OpenAI|timed out|sk-|stack/i)
  })

  it("never makes a third attempt, on this tick or a later one", async () => {
    await seed()
    const deps = happyDeps({ rank: vi.fn(async () => Promise.reject(new RankingError("timeout", "t"))) })

    await tick(deps)
    clock = at("2026-09-21T05:55:00Z")
    expect(await tick(deps)).toEqual({ status: "idle" })
    clock = at("2026-09-21T06:30:00Z")
    expect(await tick(deps)).toEqual({ status: "idle" })

    expect(deps.rank).toHaveBeenCalledTimes(2)
    expect((await stored())?.attempts).toBe(2)
  })

  it("does not retry a permanent failure", async () => {
    await seed()
    const deps = happyDeps({ rank: vi.fn(async () => Promise.reject(new RankingError("not-configured", "OPENAI_API_KEY is not set"))) })

    expect(await tick(deps)).toEqual({ status: "failed", slot: "2026-09-21T08:00", attempts: 1 })
    expect(deps.rank).toHaveBeenCalledTimes(1)
    expect(await stored()).toMatchObject({ status: "failed", attempts: 1, error: { retryable: false } })
  })

  it("does not retry a rejected ElevenLabs key, after the script was already written", async () => {
    await seed()
    const deps = happyDeps({ voice: vi.fn(async () => Promise.reject(new AudioError("auth", "ElevenLabs rejected the API key"))) })

    expect(await tick(deps)).toMatchObject({ status: "failed", attempts: 1 })
    expect(deps.voice).toHaveBeenCalledTimes(1)
    expect(deps.news.fetchCandidateArticles).toHaveBeenCalledTimes(1)
    expect(await stored()).toMatchObject({ error: { message: "The episode script was generated, but we couldn't generate the audio.", retryable: false } })
  })

  it("retries a transient ElevenLabs failure", async () => {
    await seed()
    const base = happyDeps()
    const deps = happyDeps({ voice: vi.fn(base.voice).mockRejectedValueOnce(new AudioError("upstream", "ElevenLabs returned an error (503)")) })

    expect(await tick(deps)).toMatchObject({ status: "completed", attempts: 2 })
    expect(deps.voice).toHaveBeenCalledTimes(2)
    expect(deps.store.saved).toHaveLength(1)
  })

  it("does not call ElevenLabs for an attempt whose script failed validation, on either attempt", async () => {
    await seed()
    const failed = (ids = ["a", "b"]) => scriptResponse(ids, { validation: validation({ passed: false }) })
    const deps = happyDeps({
      script: vi.fn(async (_input, progress) => {
        progress.planned()
        progress.written()
        return failed()
      }),
    })

    const outcome = await tick(deps)

    expect(outcome).toEqual({ status: "failed", slot: "2026-09-21T08:00", attempts: 2 })
    expect(deps.voice).not.toHaveBeenCalled()
    expect(deps.store.saved).toHaveLength(0)
    expect(await stored()).toMatchObject({ error: { message: "We couldn't validate this episode reliably." } })
  })

  it("leaves the Writer's own retry inside one attempt: it does not count as a scheduled attempt", async () => {
    await seed()
    const scripts = [scriptResponse(["a", "b"], { validation: validation({ passed: false }) }), scriptResponse(["a", "b"])]
    const deps = happyDeps({
      script: vi.fn(async (_input, progress) => {
        progress.planned()
        progress.written()
        return scripts.shift() as (typeof scripts)[number]
      }),
    })

    const outcome = await tick(deps)

    // The pipeline wrote the script twice; the scheduler made one attempt.
    expect(deps.script).toHaveBeenCalledTimes(2)
    expect(outcome).toEqual({ status: "completed", slot: "2026-09-21T08:00", attempts: 1 })
    expect(deps.voice).toHaveBeenCalledTimes(1)
  })

  it("keeps the Writer's retry independent when the scheduled retry happens too", async () => {
    await seed()
    const bad = () => scriptResponse(["a", "b"], { validation: validation({ passed: false }) })
    // Attempt 1: bad, bad (Writer retry inside it). Attempt 2: good.
    const scripts = [bad(), bad(), scriptResponse(["a", "b"])]
    const deps = happyDeps({
      script: vi.fn(async (_input, progress) => {
        progress.planned()
        progress.written()
        return scripts.shift() as (typeof scripts)[number]
      }),
    })

    expect(await tick(deps)).toMatchObject({ status: "completed", attempts: 2 })
    expect(deps.script).toHaveBeenCalledTimes(3)
    expect(deps.voice).toHaveBeenCalledTimes(1)
  })

  it("makes both attempts with the settings saved when the slot was claimed, even if they change in between", async () => {
    await seed({ interests: ["Space"], language: "es", tone: "humorous" })
    const base = happyDeps()
    let calls = 0
    const deps = happyDeps({
      rank: vi.fn(async (input) => {
        calls++
        if (calls === 1) {
          // The user saves different settings while the first attempt is running.
          await store.update((file) => ({ ...file, config: file.config && { ...file.config, interests: ["Cooking"], language: "en", tone: "informative" } }))
          throw new RankingError("timeout", "t")
        }
        return base.rank(input)
      }),
    })

    expect(await tick(deps)).toMatchObject({ status: "completed", attempts: 2 })

    expect(deps.news.fetchCandidateArticles).toHaveBeenNthCalledWith(1, { interests: ["Space"] })
    expect(deps.news.fetchCandidateArticles).toHaveBeenNthCalledWith(2, { interests: ["Space"] })
    expect(deps.script).toHaveBeenCalledWith(expect.objectContaining({ interests: ["Space"], language: "es", tone: "humorous" }), expect.anything())
  })

  it("records the attempt under way, so the page can say it is trying again", async () => {
    await seed()
    const base = happyDeps()
    let midSecond: Awaited<ReturnType<typeof stored>> = null
    let calls = 0
    const deps = happyDeps({
      rank: vi.fn(async (input) => {
        calls++
        if (calls === 1) throw new RankingError("timeout", "t")
        midSecond = (await createScheduleStore(file).read()).run
        return base.rank(input)
      }),
    })

    await tick(deps)

    expect(midSecond).toMatchObject({ status: "running", attempts: 2 })
  })
})

describe("a server that is not configured", () => {
  const withoutTavily = { ...ENV, TAVILY_API_KEY: "" } as NodeJS.ProcessEnv
  const claimFiles = async () => (await readdir(path.join(dir, "claims")).catch(() => [])).filter((name) => name.endsWith(".claim"))

  it("does not use up the slot: nothing is claimed, recorded as a run, or spent", async () => {
    await seed()
    const deps = happyDeps()
    const createServices = vi.fn(() => deps)

    const outcome = await runScheduleTick({ store, lock, claims, env: withoutTavily, createServices, now: () => clock, log: () => {} })

    expect(outcome).toEqual({ status: "config-error", message: "TAVILY_API_KEY is not set on the server." })
    expect(await stored()).toBeNull()
    expect(await claimFiles()).toEqual([])
    expect(lock.owner()).toBeUndefined()
    expect(createServices).not.toHaveBeenCalled()
  })

  it("never calls a provider", async () => {
    await seed()
    const deps = happyDeps()

    await tick(deps, { env: withoutTavily })

    for (const service of [deps.news.fetchCandidateArticles, deps.rank, deps.research, deps.script, deps.voice]) expect(service).not.toHaveBeenCalled()
    expect(deps.store.saved).toHaveLength(0)
  })

  it("names the setting that is wrong, and never its value", async () => {
    await seed()
    const deps = happyDeps()
    const cases: [Partial<Record<string, string>>, RegExp][] = [
      [{ GNEWS_API_KEY: "" }, /GNEWS_API_KEY is not set/],
      [{ OPENAI_API_KEY: "" }, /OPENAI_API_KEY is not set/],
      [{ ELEVENLABS_API_KEY: "" }, /ELEVENLABS_API_KEY is not set/],
      [{ ELEVENLABS_VOICE_ID: "" }, /ELEVENLABS_VOICE_ID is not set/],
      [{ ELEVENLABS_VOICE_ID: "not a voice id!" }, /ELEVENLABS_VOICE_ID is not a valid/],
      [{ ELEVENLABS_MODEL_ID: "eleven_imaginary_v9" }, /ELEVENLABS_MODEL_ID is not a supported model/],
    ]

    for (const [change, message] of cases) {
      const outcome = await tick(deps, { env: { ...ENV, ...change } as NodeJS.ProcessEnv })
      expect(outcome).toMatchObject({ status: "config-error", message: expect.stringMatching(message) })
      const text = JSON.stringify(outcome)
      for (const secret of ["gnews-secret", "sk-secret-key", "tvly-secret", "xi-secret-key", "JBFqnCBsd6RMkjVDRZzb", "not a voice id!", "eleven_imaginary_v9"]) expect(text).not.toContain(secret)
    }
  })

  it("lists every missing setting when several are missing", async () => {
    await seed()

    const outcome = await tick(happyDeps(), { env: { ...ENV, TAVILY_API_KEY: "", OPENAI_API_KEY: "" } as NodeJS.ProcessEnv })

    expect(outcome).toEqual({ status: "config-error", message: "These settings are not set on the server: OPENAI_API_KEY, TAVILY_API_KEY." })
  })

  it("is recorded for the user, once, without claiming anything", async () => {
    await seed()
    await tick(happyDeps(), { env: withoutTavily })
    const first = (await store.read()).problem
    clock = at("2026-09-21T05:52:00Z")
    await tick(happyDeps(), { env: withoutTavily })

    expect(first).toEqual({ message: "TAVILY_API_KEY is not set on the server.", since: "2026-09-21T05:50:00.000Z" })
    // Seen again on a later tick: still the same note, not rewritten with a new time.
    expect((await store.read()).problem).toEqual(first)
    expect(scheduleStatus(await store.read(), clock)).toMatchObject({ configProblem: first, run: null })
  })

  it("makes one configuration check per tick, not a retry loop", async () => {
    await seed()
    let reads = 0
    const counting = new Proxy(withoutTavily, {
      get(target, name) {
        if (name === "TAVILY_API_KEY") reads++
        return target[name as string]
      },
    })

    await tick(happyDeps(), { env: counting })

    expect(reads).toBe(1)
  })

  it("checks again on the next tick, and runs the pending slot as soon as the configuration is valid", async () => {
    await seed()
    const deps = happyDeps()
    expect(await tick(deps, { env: withoutTavily })).toMatchObject({ status: "config-error" })
    clock = at("2026-09-21T05:53:00Z")
    expect(await tick(deps, { env: withoutTavily })).toMatchObject({ status: "config-error" })
    expect(deps.voice).not.toHaveBeenCalled()

    // The key is fixed (the server was restarted with it) while the slot is still within its window.
    clock = at("2026-09-21T05:56:00Z")
    const outcome = await tick(deps)

    expect(outcome).toEqual({ status: "completed", slot: "2026-09-21T08:00", attempts: 1 })
    expect(deps.voice).toHaveBeenCalledTimes(1)
    expect(deps.store.saved).toHaveLength(1)
    expect(await stored()).toMatchObject({ status: "completed", attempts: 1 })
    // The note is gone once the slot has a run.
    expect((await store.read()).problem).toBeNull()
  })

  it("still catches the slot up after the delivery time, within the 6 hours", async () => {
    await seed()
    const deps = happyDeps()
    await tick(deps, { env: withoutTavily })

    clock = at("2026-09-21T09:30:00Z") // 11:30 in Madrid, 3.5 hours after the 08:00 delivery
    expect(await tick(deps)).toMatchObject({ status: "completed" })
    expect(await stored()).toMatchObject({ late: true })
  })

  it("gives up quietly once the slot is past its window, and clears the note", async () => {
    await seed()
    const deps = happyDeps()
    await tick(deps, { env: withoutTavily })
    expect((await store.read()).problem).not.toBeNull()

    clock = at("2026-09-21T12:30:00Z") // more than 6 hours after delivery
    expect(await tick(deps)).toEqual({ status: "idle" })

    expect(deps.voice).not.toHaveBeenCalled()
    expect((await store.read()).problem).toBeNull()
    expect(await stored()).toBeNull()
  })

  it("leaves generation failures to the retry rules: a valid configuration still claims, retries and stops as before", async () => {
    await seed()
    const deps = happyDeps({ rank: vi.fn(async () => Promise.reject(new RankingError("timeout", "t"))) })

    expect(await tick(deps)).toEqual({ status: "failed", slot: "2026-09-21T08:00", attempts: 2 })
    expect(deps.rank).toHaveBeenCalledTimes(2)
    expect(await tick(deps)).toEqual({ status: "idle" })
  })

  it("does not affect manual generation: the lock is never taken", async () => {
    await seed()
    await tick(happyDeps(), { env: withoutTavily })

    expect(lock.tryAcquire("manual")).toBeTypeOf("function")
  })
})

describe("the claim on a slot, across processes", () => {
  /** A second process: its own lock, store, claims and services over the same directory; nothing in memory is shared. */
  const otherProcess = () => ({ lock: createGenerationLock(), store: createScheduleStore(file), claims: createSlotClaims(path.join(dir, "claims")), deps: happyDeps() })
  const tickAs = (process: ReturnType<typeof otherProcess>) => {
    const { onProgress: _p, signal: _s, log: _l, clock: _c, ...services } = process.deps
    return runScheduleTick({ store: process.store, lock: process.lock, claims: process.claims, env: ENV, createServices: () => services, now: () => clock, log: () => {} })
  }
  const claimFile = () => path.join(dir, "claims", "2026-09-21.claim")
  const calls = (service: unknown) => (service as ReturnType<typeof vi.fn>).mock.calls.length

  it("lets only one of several processes racing for the same slot claim and generate it", async () => {
    await seed()
    const processes = Array.from({ length: 5 }, otherProcess)

    const outcomes = await Promise.all(processes.map(tickAs))

    expect(outcomes.filter(({ status }) => status === "completed")).toHaveLength(1)
    expect(outcomes.filter(({ status }) => status !== "completed").every(({ status }) => ["claimed-elsewhere", "idle", "busy"].includes(status))).toBe(true)
    expect(processes.filter(({ deps }) => calls(deps.voice) > 0)).toHaveLength(1)
    expect(processes.reduce((total, { deps }) => total + deps.store.saved.length, 0)).toBe(1)
    expect(await stored()).toMatchObject({ status: "completed", attempts: 1 })
  })

  it("leaves a slot alone while another process holds its claim, and takes it once that claim is released", async () => {
    await seed()
    const holder = await otherProcess().claims.tryClaim("2026-09-21")
    const second = otherProcess()

    expect(await tickAs(second)).toEqual({ status: "claimed-elsewhere" })
    expect(second.deps.news.fetchCandidateArticles).not.toHaveBeenCalled()
    expect(await stored()).toBeNull()

    await holder?.release()
    expect(await tickAs(second)).toMatchObject({ status: "completed" })
  })

  it("takes over a claim whose holder stopped showing signs of life", async () => {
    await seed()
    await otherProcess().claims.tryClaim("2026-09-21")
    const old = new Date(Date.now() - 10 * 60_000)
    await utimes(claimFile(), old, old) // the process that made it died ten minutes ago
    const second = otherProcess()

    expect(await tickAs(second)).toMatchObject({ status: "completed" })
    expect(second.deps.voice).toHaveBeenCalledTimes(1)
  })

  it("does not take over a claim that is still being kept alive", async () => {
    await seed()
    await otherProcess().claims.tryClaim("2026-09-21")
    const recent = new Date(Date.now() - 30_000)
    await utimes(claimFile(), recent, recent)

    expect(await tickAs(otherProcess())).toEqual({ status: "claimed-elsewhere" })
  })

  it("releases the claim when the run is over, whatever became of it", async () => {
    await seed()
    await tick(happyDeps())
    expect(await readdir(path.join(dir, "claims"))).toEqual([])

    await store.update((current) => ({ ...current, run: null }))
    await tick(happyDeps({ rank: vi.fn(async () => Promise.reject(new RankingError("not-configured", "x"))) }))
    expect(await readdir(path.join(dir, "claims"))).toEqual([])
  })

  it("keeps the claim while the run is going, and shows it is alive by touching it", async () => {
    await seed()
    let claimedDuringRun = false
    let touched = false
    const deps = happyDeps({
      voice: vi.fn(async () => {
        const before = (await stat(claimFile())).mtimeMs
        claimedDuringRun = true
        await new Promise((resolve) => setTimeout(resolve, 150))
        touched = (await stat(claimFile())).mtimeMs > before
        return { audio: MP3, durationMs: 5 }
      }),
    })

    await tick(deps, { heartbeatMs: 20 })

    expect(claimedDuringRun).toBe(true)
    expect(touched).toBe(true)
  })

  it("allows a later day's slot once an earlier one is released", async () => {
    await seed()
    await tick(happyDeps())
    clock = at("2026-09-22T05:50:00Z")

    expect(await tick(happyDeps())).toMatchObject({ status: "completed", slot: "2026-09-22T08:00" })
  })

  it("does not start a slot that another process recorded as running after this one first saw it due (the second look inside the claim)", async () => {
    await seed()
    await store.update((current) => ({ ...current, run: runOf({ status: "running", finishedAt: undefined, late: undefined, episodeId: undefined }) }))
    // The tick reads the schedule three times: the interrupted-run check, its first look, and (once it holds the claim) its second.
    // The first two see the world as it was before the other process recorded the run; the third sees the truth.
    let reads = 0
    const behind: typeof store = { ...store, read: async () => ({ ...(await store.read()), ...(++reads <= 2 ? { run: null } : {}) }) }
    const deps = happyDeps()
    const { onProgress: _p, signal: _s, log: _l, clock: _c, ...services } = deps

    const outcome = await runScheduleTick({ store: behind, lock, claims, env: ENV, createServices: () => services, now: () => clock, log: () => {} })

    expect(outcome).toEqual({ status: "idle" })
    expect(reads).toBe(3)
    expect(deps.news.fetchCandidateArticles).not.toHaveBeenCalled()
  })

  it("makes a duplicate scheduled generation impossible, however many processes and ticks", async () => {
    await seed()
    const processes = Array.from({ length: 6 }, otherProcess)

    for (let round = 0; round < 3; round++) await Promise.all(processes.map(tickAs))

    expect(processes.reduce((total, { deps }) => total + calls(deps.voice), 0)).toBe(1)
    expect(processes.reduce((total, { deps }) => total + calls(deps.news.fetchCandidateArticles), 0)).toBe(1)
    expect(processes.reduce((total, { deps }) => total + deps.store.saved.length, 0)).toBe(1)
  })

  it("does not close a run that another live process is carrying out", async () => {
    await seed()
    await store.update((current) => ({ ...current, run: runOf({ status: "running", finishedAt: undefined, late: undefined, episodeId: undefined }) }))
    await otherProcess().claims.tryClaim("2026-09-21") // its claim is live

    await tick(happyDeps())

    expect((await stored())?.status).toBe("running")
  })

  it("closes a run left by a process that died, and clears its claim", async () => {
    await seed()
    await store.update((current) => ({ ...current, run: runOf({ status: "running", finishedAt: undefined, late: undefined, episodeId: undefined }) }))
    await otherProcess().claims.tryClaim("2026-09-21")
    const old = new Date(Date.now() - 10 * 60_000)
    await utimes(claimFile(), old, old)

    await tick(happyDeps())

    expect(await stored()).toMatchObject({ status: "failed", error: { message: expect.stringContaining("restarted"), retryable: false } })
    expect(await readdir(path.join(dir, "claims"))).toEqual([])
  })
})

describe("duplicate protection", () => {
  it("does not claim the same slot twice, and the claim survives a restart", async () => {
    await seed()
    const deps = happyDeps()
    await tick(deps)

    // A restart: nothing in memory, a new store and a new lock over the same file.
    const restarted = createScheduleStore(file)
    const again = await runScheduleTick({
      store: restarted,
      lock: createGenerationLock(),
      claims: createSlotClaims(path.join(dir, "claims")),
      env: ENV,
      createServices: () => deps,
      now: () => at("2026-09-21T05:59:00Z"),
      log: () => {},
    })

    expect(again).toEqual({ status: "idle" })
    expect(deps.voice).toHaveBeenCalledTimes(1)
    expect(deps.store.saved).toHaveLength(1)
  })

  it("keeps the last run's status across a restart", async () => {
    await seed()
    await tick(happyDeps({ rank: vi.fn(async () => Promise.reject(new RankingError("timeout", "t"))) }))

    const afterRestart = await createScheduleStore(file).read()

    expect(afterRestart.config).toMatchObject({ enabled: true, frequency: "daily", timeZone: "Europe/Madrid" })
    expect(afterRestart.run).toMatchObject({ status: "failed", attempts: 2, slot: "2026-09-21T08:00", error: { retryable: true } })
  })

  it("never starts a second episode the same day when the delivery time is changed after the run", async () => {
    await seed()
    const deps = happyDeps()
    await tick(deps)

    await store.update((file) => ({ ...file, config: file.config && { ...file.config, deliveryTime: "09:00", armedAt: "2026-09-21T06:10:00.000Z" } }))
    clock = at("2026-09-21T06:50:00Z") // 08:50 Madrid: the new 09:00 slot has begun

    expect(await tick(deps)).toEqual({ status: "idle" })
    expect(deps.voice).toHaveBeenCalledTimes(1)
  })

  it("does not start a slot that is already claimed and running when another tick looks", async () => {
    await seed()
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    const deps = happyDeps({
      voice: vi.fn(async () => {
        await gate
        return { audio: MP3, durationMs: 5 }
      }),
    })

    const first = tick(deps)
    await vi.waitFor(() => expect(deps.voice).toHaveBeenCalled())
    const second = await tick(deps)
    release()

    // The slot is already claimed by the first tick, so the second has nothing to start.
    expect(second).toEqual({ status: "idle" })
    expect(await first).toMatchObject({ status: "completed" })
    expect(deps.news.fetchCandidateArticles).toHaveBeenCalledTimes(1)
  })

  it("runs one pipeline when two ticks start at the same moment", async () => {
    await seed()
    const deps = happyDeps()

    const outcomes = await Promise.all([tick(deps), tick(deps)])

    expect(outcomes.filter(({ status }) => status === "completed")).toHaveLength(1)
    expect(outcomes.filter(({ status }) => status === "completed")[0]).toMatchObject({ attempts: 1 })
    expect(deps.news.fetchCandidateArticles).toHaveBeenCalledTimes(1)
    expect(deps.voice).toHaveBeenCalledTimes(1)
    expect(deps.store.saved).toHaveLength(1)
  })

  it("does not start while a manual episode is being generated, and leaves the slot unclaimed for the next look", async () => {
    await seed()
    const release = lock.tryAcquire("manual")
    const deps = happyDeps()

    expect(await tick(deps)).toEqual({ status: "busy" })
    expect(deps.news.fetchCandidateArticles).not.toHaveBeenCalled()
    expect(await stored()).toBeNull()

    release?.()
    expect(await tick(deps)).toMatchObject({ status: "completed" })
  })

  it("makes a manual episode wait while a scheduled one is running", async () => {
    await seed()
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    const scheduled = happyDeps({
      voice: vi.fn(async () => {
        await gate
        return { audio: MP3, durationMs: 5 }
      }),
    })
    const manual = happyDeps()
    const { onProgress: _p, signal: _s, log: _l, clock: _c, ...manualServices } = manual

    const running = tick(scheduled)
    await vi.waitFor(() => expect(scheduled.voice).toHaveBeenCalled())
    const response = await handleGenerateEpisode(
      new Request("http://localhost/api/generate-episode", { method: "POST", body: JSON.stringify({ interests: ["AI"], language: "en", tone: "conversational" }) }),
      { env: ENV, createServices: () => manualServices, lock },
    )
    release()
    await running

    expect(response.status).toBe(409)
    expect(manual.news.fetchCandidateArticles).not.toHaveBeenCalled()
    // ...and the lock is free again afterwards.
    expect(lock.owner()).toBeUndefined()
  })

  it("releases the lock after a failed run too", async () => {
    await seed()
    await tick(happyDeps({ rank: vi.fn(async () => Promise.reject(new RankingError("not-configured", "x"))) }))

    expect(lock.owner()).toBeUndefined()
  })
})

describe("a run cut short by a restart", () => {
  it("is closed as failed and is not started again", async () => {
    await seed()
    await store.update((file) => ({ ...file, run: runOf({ status: "running", attempts: 1, finishedAt: undefined, late: undefined, episodeId: undefined }) }))
    const deps = happyDeps()

    expect(await tick(deps)).toEqual({ status: "idle" })

    expect(deps.news.fetchCandidateArticles).not.toHaveBeenCalled()
    expect(await stored()).toMatchObject({
      status: "failed",
      error: { message: "The server was restarted while this episode was being generated, so it was not completed.", retryable: false },
    })
  })

  it("is left alone while this process is still running it", async () => {
    await seed()
    await store.update((file) => ({ ...file, run: runOf({ status: "running", finishedAt: undefined, late: undefined, episodeId: undefined }) }))
    const release = lock.tryAcquire("scheduled")

    await tick(happyDeps())

    expect((await stored())?.status).toBe("running")
    release?.()
  })
})
