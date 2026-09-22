import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
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

describe("saveFailedScript", () => {
  const record = {
    attempt: 2,
    maxAttempts: 2,
    feedback: [{ source: "ai" as const, type: "unsupported-connection", severity: "error" as const, message: "Outro links stories.", segmentIndex: 4 }],
    script: { title: "A Title", script: "Words." } as never,
  }

  it("writes one JSON file per attempt under failed-scripts, with the attempt, the feedback and the script", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "prosperpod-failed-"))
    const store = createEpisodeStore(dir)

    const name = await store.saveFailedScript(record)
    const other = await store.saveFailedScript({ ...record, attempt: 1, feedback: [] })

    expect(name).toMatch(/^\d{4}-\d{2}-\d{2}T[\d-]+Z-attempt-2-[0-9a-f]{4}\.json$/)
    expect(other).not.toBe(name)
    const saved = JSON.parse(await readFile(path.join(dir, "failed-scripts", name), "utf8"))
    expect(saved).toMatchObject({ attempt: 2, maxAttempts: 2, feedbackGiven: record.feedback, script: record.script })
    expect(typeof saved.savedAt).toBe("string")
  })

  it("is never served as an episode: read() only knows <id>.mp3", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "prosperpod-failed-"))
    const store = createEpisodeStore(dir)
    const name = await store.saveFailedScript(record)

    expect(await store.read(name.replace(/\.json$/, ""))).toBeUndefined()
  })
})

describe("parseEpisodeRequest", () => {
  const settings = { interests: ["AI"], language: "en", tone: "conversational" }
  const fixed = { ...settings, durationMinutes: 9 }

  it("takes the user's settings and fixes the duration at 9 minutes", () => {
    expect(parseEpisodeRequest(settings)).toEqual({ ok: true, request: fixed })
  })

  it("drops a voice if one is sent", () => {
    const parsed = parseEpisodeRequest({ ...settings, voiceId: "abc", voice: "nova" })
    expect(parsed).toEqual({ ok: true, request: fixed })
  })

  it("ignores a duration a client sends: it is always 9 minutes", () => {
    for (const durationMinutes of [3, 10.5, 20, 60, 61, "long"]) {
      expect(parseEpisodeRequest({ ...settings, durationMinutes })).toEqual({ ok: true, request: fixed })
    }
  })

  it("rejects missing or invalid settings", () => {
    expect(parseEpisodeRequest({ ...settings, interests: undefined }).ok).toBe(false)
    expect(parseEpisodeRequest({ ...settings, tone: "angry" }).ok).toBe(false)
    expect(parseEpisodeRequest(null).ok).toBe(false)
  })
})

describe("the stored list of podcasts (saveEpisode / list)", () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "prosperpod-list-"))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  const details = (id: string, publishedAt: string, title = `Title ${id}`) => ({
    id,
    title,
    summary: `Summary ${id}`,
    description: `Description ${id}`,
    topics: ["Formula 1"],
    sources: [{ name: "news.example.com", url: "https://news.example.com/a" }],
    durationSeconds: 560,
    publishedAt,
  })
  const audio = new Uint8Array([0x49, 0x44, 0x33, 1, 2, 3])

  /** Saves the audio through the store (so the id is real), then its details, as the pipeline does. */
  async function saveWithDetails(podcasts: ReturnType<typeof createEpisodeStore>, title: string, publishedAt: string) {
    const { id } = await podcasts.save({ audio, title })
    await podcasts.saveEpisode(details(id, publishedAt, title))
    return id
  }

  it("lists the podcasts newest first, by when they were generated", async () => {
    const podcasts = createEpisodeStore(dir)
    const oldest = await saveWithDetails(podcasts, "First one", "2026-09-18T08:00:00.000Z")
    const newest = await saveWithDetails(podcasts, "Third one", "2026-09-20T23:30:00.000Z")
    const middle = await saveWithDetails(podcasts, "Second one", "2026-09-19T12:00:00.000Z")

    expect((await podcasts.list()).map(({ id }) => id)).toEqual([newest, middle, oldest])
  })

  it("keeps the list across a restart: a new store on the same folder sees every podcast, with its details", async () => {
    const id = await saveWithDetails(createEpisodeStore(dir), "Kept between sessions", "2026-09-20T10:00:00.000Z")

    const [listed] = await createEpisodeStore(dir).list()

    expect(listed).toEqual(details(id, "2026-09-20T10:00:00.000Z", "Kept between sessions"))
    expect(listed).not.toHaveProperty("recovered")
  })

  it("lists only podcasts whose audio is stored, and ignores the failed-scripts folder and stray files", async () => {
    const podcasts = createEpisodeStore(dir)
    const kept = await saveWithDetails(podcasts, "Has audio", "2026-09-20T10:00:00.000Z")
    await podcasts.saveEpisode(details("audio-is-gone-0a1b2c3d", "2026-09-21T10:00:00.000Z"))
    await podcasts.saveFailedScript({ attempt: 1, maxAttempts: 2, feedback: [], script: { title: "Failed" } as never })
    await writeFile(path.join(dir, "notes.txt"), "not a podcast")
    await writeFile(path.join(dir, "Not_An_Id.mp3"), audio)

    expect((await podcasts.list()).map(({ id }) => id)).toEqual([kept])
  })

  it("rebuilds a podcast from its audio file when its details are missing, and marks it as recovered", async () => {
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, "ai-pacing-an-ai-force-e9118c58.mp3"), new Uint8Array(16_000))

    const [listed] = await createEpisodeStore(dir).list()

    expect(listed).toMatchObject({ id: "ai-pacing-an-ai-force-e9118c58", title: "Ai Pacing An Ai Force", durationSeconds: 1, topics: [], sources: [], recovered: true })
    expect(Number.isNaN(Date.parse(listed.publishedAt))).toBe(false)
  })

  it("does not trust a damaged details file, or one that names another podcast", async () => {
    const podcasts = createEpisodeStore(dir)
    const damaged = await saveWithDetails(podcasts, "Damaged details", "2026-09-20T10:00:00.000Z")
    await writeFile(path.join(dir, `${damaged}.json`), "{ not json")
    const swapped = await saveWithDetails(podcasts, "Swapped details", "2026-09-20T11:00:00.000Z")
    await writeFile(path.join(dir, `${swapped}.json`), JSON.stringify(details("someone-else-0a1b2c3d", "2026-09-20T11:00:00.000Z")))

    const listed = await podcasts.list()

    expect(listed.map(({ id, recovered }) => [id, recovered])).toEqual(
      expect.arrayContaining([
        [damaged, true],
        [swapped, true],
      ]),
    )
    expect(listed.map(({ title }) => title)).not.toContain("Title someone-else-0a1b2c3d")
  })

  it("answers an empty list when nothing has been generated yet", async () => {
    expect(await createEpisodeStore(path.join(dir, "does-not-exist-yet")).list()).toEqual([])
  })

  it("refuses to save details that are not a podcast's", async () => {
    await expect(createEpisodeStore(dir).saveEpisode({ ...details("a-0a1b2c3d", "2026-09-20T10:00:00.000Z"), publishedAt: "yesterday" })).rejects.toThrow()
    await expect(createEpisodeStore(dir).saveEpisode({ ...details("../escape", "2026-09-20T10:00:00.000Z") })).rejects.toThrow()
  })
})
