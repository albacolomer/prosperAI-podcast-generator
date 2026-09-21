import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { StoredPodcast } from "../../src/types/generation.js"
import { GET } from "../../api/episodes.js"
import { listEpisodes } from "./list.js"
import type { EpisodeStore, ListedEpisode } from "./storage.js"

const listed = (id: string, publishedAt: string, extra: Partial<ListedEpisode> = {}): ListedEpisode => ({
  id,
  title: `Title ${id}`,
  summary: `Summary ${id}`,
  description: `Description ${id}`,
  topics: ["Formula 1"],
  sources: [],
  durationSeconds: 560,
  publishedAt,
  ...extra,
})

const storeWith = (list: EpisodeStore["list"]): EpisodeStore => ({ save: vi.fn(), read: vi.fn(), saveEpisode: vi.fn(), saveFailedScript: vi.fn(), list })

describe("GET /api/episodes", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it("answers the stored podcasts in the order the store gives them (newest first), each with its play and download links", async () => {
    const store = storeWith(vi.fn(async () => [listed("new-0a1b2c3d", "2026-09-21T10:00:00.000Z"), listed("old-1a2b3c4d", "2026-09-19T10:00:00.000Z")]))

    const response = await listEpisodes(store)
    const { episodes } = (await response.json()) as { episodes: StoredPodcast[] }

    expect(response.status).toBe(200)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    expect(episodes.map(({ id }) => id)).toEqual(["new-0a1b2c3d", "old-1a2b3c4d"])
    expect(episodes[0]).toMatchObject({
      title: "Title new-0a1b2c3d",
      publishedAt: "2026-09-21T10:00:00.000Z",
      audioUrl: "/api/episode-audio?id=new-0a1b2c3d",
      downloadUrl: "/api/episode-audio?id=new-0a1b2c3d&download=1",
      downloadFilename: "prosperpod-new.mp3",
    })
  })

  it("marks a podcast that was rebuilt from its audio file", async () => {
    const store = storeWith(vi.fn(async () => [listed("ai-pacing-e9118c58", "2026-09-20T19:00:00.000Z", { recovered: true })]))
    const { episodes } = (await (await listEpisodes(store)).json()) as { episodes: StoredPodcast[] }
    expect(episodes[0].recovered).toBe(true)
  })

  it("answers an empty list before anything has been generated", async () => {
    const response = await listEpisodes(storeWith(vi.fn(async () => [])))
    expect(await response.json()).toEqual({ episodes: [] })
  })

  it("answers 500 with a generic message, and no details, when the store cannot be read", async () => {
    const response = await listEpisodes(storeWith(vi.fn(async () => Promise.reject(new Error("EACCES: /secret/path")))))
    expect(response.status).toBe(500)
    expect(JSON.stringify(await response.json())).not.toContain("/secret/path")
  })

  it("the real endpoint reads the configured episode directory and calls no provider", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const saved = process.env.EPISODE_STORAGE_DIR
    process.env.EPISODE_STORAGE_DIR = "/definitely/not/a/real/folder"
    try {
      const response = await GET()
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ episodes: [] })
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      if (saved === undefined) delete process.env.EPISODE_STORAGE_DIR
      else process.env.EPISODE_STORAGE_DIR = saved
      vi.unstubAllGlobals()
    }
  })
})
