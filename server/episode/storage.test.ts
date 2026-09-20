import { mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { parseEpisodeRequest } from "./request.js"
import { createEpisodeStore, defaultStorageDir, downloadFilename, isEpisodeId, slugify } from "./storage.js"

describe("slugify", () => {
  it("makes a short, lowercase, hyphenated ascii slug", () => {
    expect(slugify("AI Chips & Race Cars: Your Briefing")).toBe("ai-chips-race-cars-your-briefing")
    expect(slugify("Café — el año de la IA")).toBe("cafe-el-ano-de-la-ia")
    expect(slugify("¡¡¡")).toBe("episode")
    expect(slugify("word ".repeat(40)).length).toBeLessThanOrEqual(60)
    expect(slugify("word ".repeat(40))).not.toMatch(/-$/)
  })
})

describe("episode ids and filenames", () => {
  it("accepts only lowercase hyphenated ids", () => {
    expect(isEpisodeId("ai-chips-0a1b2c3d")).toBe(true)
    for (const bad of ["", "../x", "a/b", "a\\b", "A-b", "a_b", "a--b", "-a", "a-", "a.mp3"]) expect(isEpisodeId(bad)).toBe(false)
  })

  it("names the download after the title, without the random suffix", () => {
    expect(downloadFilename("ai-chips-race-cars-0a1b2c3d")).toBe("prosperpod-ai-chips-race-cars.mp3")
    expect(downloadFilename("episode-0a1b2c3d")).toBe("prosperpod-episode.mp3")
  })
})

describe("createEpisodeStore", () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "prosperpod-test-"))
  })
  afterEach(() => rm(dir, { recursive: true, force: true }))

  it("saves the exact bytes under a title-based id and reads them back", async () => {
    const store = createEpisodeStore(path.join(dir, "nested"))
    const audio = Uint8Array.from({ length: 5000 }, (_, index) => index % 256)

    const { id } = await store.save({ audio, title: "Chips & Cars" })

    expect(id).toMatch(/^chips-cars-[0-9a-f]{8}$/)
    expect([...((await store.read(id)) ?? [])]).toEqual([...audio])
    expect(await readdir(path.join(dir, "nested"))).toEqual([`${id}.mp3`])
  })

  it("gives two episodes with the same title different ids", async () => {
    const store = createEpisodeStore(dir)
    const a = await store.save({ audio: new Uint8Array([1]), title: "Same" })
    const b = await store.save({ audio: new Uint8Array([2]), title: "Same" })
    expect(a.id).not.toBe(b.id)
  })

  it("reads nothing for an unknown id or one that would leave the directory", async () => {
    const store = createEpisodeStore(dir)
    expect(await store.read("nothing-00000000")).toBeUndefined()
    expect(await store.read("../package")).toBeUndefined()
  })
})

describe("defaultStorageDir", () => {
  const saved = { dir: process.env.EPISODE_STORAGE_DIR, vercel: process.env.VERCEL }
  afterEach(() => {
    for (const [key, value] of [["EPISODE_STORAGE_DIR", saved.dir], ["VERCEL", saved.vercel]] as const) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it("is .generated/episodes locally, the temp directory on Vercel, or EPISODE_STORAGE_DIR", () => {
    delete process.env.EPISODE_STORAGE_DIR
    delete process.env.VERCEL
    expect(defaultStorageDir()).toBe(path.join(process.cwd(), ".generated", "episodes"))
    process.env.VERCEL = "1"
    expect(defaultStorageDir()).toBe(path.join(tmpdir(), "prosperpod-episodes"))
    process.env.EPISODE_STORAGE_DIR = "/data/episodes"
    expect(defaultStorageDir()).toBe("/data/episodes")
  })
})

describe("parseEpisodeRequest", () => {
  const settings = { interests: ["AI"], language: "en", durationMinutes: 10, tone: "conversational" }

  it("takes the user's settings and nothing else", () => {
    expect(parseEpisodeRequest(settings)).toEqual({ ok: true, request: settings })
  })

  it("drops a voice if one is sent", () => {
    const parsed = parseEpisodeRequest({ ...settings, voiceId: "abc", voice: "nova" })
    expect(parsed).toEqual({ ok: true, request: settings })
  })

  it("rejects missing or out-of-range settings", () => {
    expect(parseEpisodeRequest({ ...settings, interests: undefined }).ok).toBe(false)
    expect(parseEpisodeRequest({ ...settings, durationMinutes: 4 }).ok).toBe(false)
    expect(parseEpisodeRequest({ ...settings, durationMinutes: 10.5 }).ok).toBe(false)
    expect(parseEpisodeRequest(null).ok).toBe(false)
  })
})
