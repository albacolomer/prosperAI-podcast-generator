import { mkdtemp, readdir, readFile, rm, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { beatInstance, forgetInstance, INSTANCE_STALE_MS, isProcessAlive, otherInstances } from "./instances.js"

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "prosperpod-instances-"))
})
afterEach(() => rm(dir, { recursive: true, force: true }))

const alive = () => true

describe("scheduler instances", () => {
  it("notes this process, with its port, and forgets it on shutdown", async () => {
    await beatInstance(5173, dir, 111)

    expect(JSON.parse(await readFile(path.join(dir, "111.json"), "utf8"))).toMatchObject({ pid: 111, port: 5173 })
    await forgetInstance(dir, 111)
    expect(await readdir(dir)).toEqual([])
  })

  it("does not count this process as another one", async () => {
    await beatInstance(5173, dir, 111)

    expect(await otherInstances(dir, 111, alive)).toEqual([])
  })

  it("finds another live dev server on the project, with its pid and port", async () => {
    await beatInstance(5173, dir, 111)
    await beatInstance(5174, dir, 222)

    expect(await otherInstances(dir, 111, alive)).toEqual([expect.objectContaining({ pid: 222, port: 5174 })])
  })

  it("finds several", async () => {
    for (const pid of [111, 222, 333]) await beatInstance(5000 + pid, dir, pid)

    expect((await otherInstances(dir, 111, alive)).map(({ pid }) => pid).sort()).toEqual([222, 333])
  })

  it("ignores, and clears, a note whose process no longer exists", async () => {
    await beatInstance(5174, dir, 222)

    expect(await otherInstances(dir, 111, () => false)).toEqual([])
    expect(await readdir(dir)).toEqual([])
  })

  it("ignores, and clears, a note that stopped being refreshed", async () => {
    await beatInstance(5174, dir, 222)
    const old = new Date(Date.now() - INSTANCE_STALE_MS - 5_000)
    await utimes(path.join(dir, "222.json"), old, old)

    expect(await otherInstances(dir, 111, alive)).toEqual([])
    expect(await readdir(dir)).toEqual([])
  })

  it("skips a note that cannot be read, and has nothing to say for a folder that does not exist", async () => {
    await writeFile(path.join(dir, "333.json"), "{ half written")

    expect(await otherInstances(dir, 111, alive)).toEqual([])
    expect(await otherInstances(path.join(dir, "missing"), 111, alive)).toEqual([])
  })

  it("knows this very process is alive and an impossible pid is not", () => {
    expect(isProcessAlive(process.pid)).toBe(true)
    expect(isProcessAlive(2_147_483_000)).toBe(false)
  })
})
