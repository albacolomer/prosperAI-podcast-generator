import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { config, runOf } from "./fixtures.js"
import { createScheduleStore } from "./store.js"

let dir: string
let file: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "prosperpod-schedule-"))
  file = path.join(dir, "schedule.json")
})
afterEach(async () => {
  vi.restoreAllMocks()
  await rm(dir, { recursive: true, force: true })
})

describe("the schedule store", () => {
  it("starts empty", async () => {
    expect(await createScheduleStore(file).read()).toEqual({ version: 1, config: null, run: null, problem: null })
  })

  it("keeps the schedule and the last run across a restart (a new store on the same file)", async () => {
    await createScheduleStore(file).update((current) => ({
      ...current,
      config: config(),
      run: runOf({ status: "failed", attempts: 2, error: { message: "It failed.", retryable: true } }),
    }))

    const afterRestart = await createScheduleStore(file).read()
    expect(afterRestart.config).toEqual(config())
    expect(afterRestart.run).toMatchObject({ slotDate: "2026-09-21", status: "failed", attempts: 2, error: { message: "It failed." } })
  })

  it("writes atomically: no temporary file is left behind and the file is complete JSON", async () => {
    const store = createScheduleStore(file)
    await store.update((current) => ({ ...current, config: config() }))
    await store.update((current) => ({ ...current, run: runOf() }))

    expect(await readdir(dir)).toEqual(["schedule.json"])
    expect(JSON.parse(await readFile(file, "utf8")).run.slotDate).toBe("2026-09-21")
  })

  it("applies overlapping updates one after another, losing none", async () => {
    const store = createScheduleStore(file)
    await store.update((current) => ({ ...current, config: config(), run: runOf({ attempts: 0 }) }))

    await Promise.all(
      Array.from({ length: 20 }, () =>
        // Separate stores on one file (as when each request builds its own) still queue behind each other.
        createScheduleStore(file).update((current) => ({ ...current, run: current.run && { ...current.run, attempts: current.run.attempts + 1 } })),
      ),
    )

    expect((await store.read()).run?.attempts).toBe(20)
  })

  it("keeps working after an update that threw", async () => {
    const store = createScheduleStore(file)
    await expect(
      store.update(() => {
        throw new Error("boom")
      }),
    ).rejects.toThrow("boom")
    await store.update((current) => ({ ...current, config: config() }))
    expect((await store.read()).config).not.toBeNull()
  })

  it("does not write a file the schema would refuse", async () => {
    const store = createScheduleStore(file)
    await expect(store.update((current) => ({ ...current, config: { ...config(), dayOfMonth: 31 } }))).rejects.toThrow()
    expect((await store.read()).config).toBeNull()
  })

  it("treats a file that cannot be read as empty instead of failing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    await writeFile(file, "{ not json")
    expect(await createScheduleStore(file).read()).toEqual({ version: 1, config: null, run: null, problem: null })
  })
})
