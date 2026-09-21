import { mkdtemp, readdir, readFile, rm, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { CLAIM_HEARTBEAT_MS, CLAIM_STALE_MS, createSlotClaims } from "./claims.js"
import { holdState, tryHold, withFileLock } from "./exclusiveFile.js"

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "prosperpod-claims-"))
})
afterEach(() => rm(dir, { recursive: true, force: true }))

const age = async (file: string, ms: number) => {
  const old = new Date(Date.now() - ms)
  await utimes(file, old, old)
}

describe("the constants", () => {
  it("beat every 15 seconds and call a claim stale after six missed beats", () => {
    expect(CLAIM_HEARTBEAT_MS).toBe(15_000)
    expect(CLAIM_STALE_MS).toBe(90_000)
    expect(CLAIM_STALE_MS).toBeGreaterThan(CLAIM_HEARTBEAT_MS * 3)
  })
})

describe("claiming a slot", () => {
  // Each createSlotClaims() below stands for another process: nothing is shared between them but the directory.
  const process_ = () => createSlotClaims(dir)

  it("gives a slot to exactly one of many simultaneous claimants", async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => process_().tryClaim("2026-09-21")))

    expect(results.filter(Boolean)).toHaveLength(1)
  })

  it("keeps the slot claimed until it is released, then lets another claim it", async () => {
    const first = await process_().tryClaim("2026-09-21")
    expect(first).toBeDefined()
    expect(await process_().tryClaim("2026-09-21")).toBeUndefined()

    await first?.release()

    expect(await process_().tryClaim("2026-09-21")).toBeDefined()
  })

  it("lets a later slot be claimed while an earlier one is held", async () => {
    await process_().tryClaim("2026-09-21")

    expect(await process_().tryClaim("2026-09-22")).toBeDefined()
    expect((await readdir(dir)).sort()).toEqual(["2026-09-21.claim", "2026-09-22.claim"])
  })

  it("says who holds it, without anything secret", async () => {
    await process_().tryClaim("2026-09-21")

    const content = JSON.parse(await readFile(path.join(dir, "2026-09-21.claim"), "utf8"))
    expect(Object.keys(content).sort()).toEqual(["heldAt", "pid", "slotDate", "token"])
  })

  it("refuses a slot date that could name another file", async () => {
    await expect(process_().tryClaim("../../evil")).rejects.toThrow()
    await expect(process_().inspect("2026-9-1")).rejects.toThrow()
  })
})

describe("a claim left by a process that died", () => {
  const file = () => path.join(dir, "2026-09-21.claim")

  it("is live while it is being touched, stale once nothing has touched it for 90 seconds", async () => {
    const claims = createSlotClaims(dir)
    expect(await claims.inspect("2026-09-21")).toBe("none")

    await claims.tryClaim("2026-09-21")
    expect(await claims.inspect("2026-09-21")).toBe("live")
    await age(file(), 89_000)
    expect(await claims.inspect("2026-09-21")).toBe("live")
    await age(file(), 91_000)
    expect(await claims.inspect("2026-09-21")).toBe("stale")
  })

  it("is taken over by the next claimant, so a crash never blocks the slot for good", async () => {
    await createSlotClaims(dir).tryClaim("2026-09-21")
    await age(file(), 10 * 60_000)

    const taken = await createSlotClaims(dir).tryClaim("2026-09-21")

    expect(taken).toBeDefined()
    expect(await createSlotClaims(dir).inspect("2026-09-21")).toBe("live")
    expect((await readdir(dir)).filter((name) => name.endsWith(".takeover"))).toEqual([])
  })

  it("is taken over by only one of many claimants that find it stale at the same time", async () => {
    await createSlotClaims(dir).tryClaim("2026-09-21")
    await age(file(), 10 * 60_000)

    const results = await Promise.all(Array.from({ length: 20 }, () => createSlotClaims(dir).tryClaim("2026-09-21")))

    expect(results.filter(Boolean)).toHaveLength(1)
    expect((await readdir(dir)).filter((name) => name.endsWith(".takeover"))).toEqual([])
  })

  it("is not taken while its holder keeps touching it", async () => {
    const held = await createSlotClaims(dir).tryClaim("2026-09-21")
    await age(file(), 80_000)
    expect(await held?.touch()).toBe(true)

    expect(await createSlotClaims(dir).tryClaim("2026-09-21")).toBeUndefined()
  })

  it("tells its old holder, if it is somehow still running, that it lost the claim, and never deletes the new holder's", async () => {
    const old = await createSlotClaims(dir).tryClaim("2026-09-21")
    await age(file(), 10 * 60_000)
    const taker = await createSlotClaims(dir).tryClaim("2026-09-21")

    expect(await old?.touch()).toBe(false)
    await old?.release()

    expect(await createSlotClaims(dir).inspect("2026-09-21")).toBe("live")
    await taker?.release()
    expect(await readdir(dir)).toEqual([])
  })

  it("is removed by pruning, and a live one is left alone", async () => {
    await createSlotClaims(dir).tryClaim("2026-09-20")
    await createSlotClaims(dir).tryClaim("2026-09-21")
    await age(path.join(dir, "2026-09-20.claim"), 10 * 60_000)

    await createSlotClaims(dir).pruneStale()

    expect(await readdir(dir)).toEqual(["2026-09-21.claim"])
  })

  it("prunes nothing from a directory that does not exist yet", async () => {
    await expect(createSlotClaims(path.join(dir, "missing")).pruneStale()).resolves.toBeUndefined()
  })
})

describe("tryHold", () => {
  it("does not take over a hold that was renewed after it first looked stale", async () => {
    const file = path.join(dir, "thing.hold")
    await tryHold(file, {}, 1000)
    await age(file, 5_000)
    // Another process renews it a moment before we look: it is not stale for us any more.
    await writeFile(file, await readFile(file, "utf8"))

    expect(await tryHold(file, {}, 1000)).toBeUndefined()
    expect(await holdState(file, 1000)).toBe("live")
  })
})

describe("withFileLock", () => {
  it("runs one piece of work at a time across separate callers", async () => {
    const file = path.join(dir, "shared.lock")
    let running = 0
    let overlapped = false
    const work = async () => {
      running++
      if (running > 1) overlapped = true
      await new Promise((resolve) => setTimeout(resolve, 15))
      running--
    }

    await Promise.all(Array.from({ length: 8 }, () => withFileLock(file, work)))

    expect(overlapped).toBe(false)
    expect(await readdir(dir)).toEqual([])
  })

  it("releases the lock when the work throws", async () => {
    const file = path.join(dir, "shared.lock")
    await expect(withFileLock(file, async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom")

    expect(await withFileLock(file, async () => "ran")).toBe("ran")
  })

  it("takes over a lock left behind by a process that died", async () => {
    const file = path.join(dir, "shared.lock")
    await tryHold(file, {}, 10_000)
    await age(file, 60_000)

    expect(await withFileLock(file, async () => "ran")).toBe("ran")
  })

  it("gives up rather than waiting for ever on a lock that is held", async () => {
    const file = path.join(dir, "shared.lock")
    await tryHold(file, {}, 10_000)

    await expect(withFileLock(file, async () => "ran", { timeoutMs: 100 })).rejects.toThrow("Timed out")
  })
})
