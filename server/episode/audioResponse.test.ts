import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GET } from "../../api/episode-audio.js"
import { serveEpisodeAudio } from "./audioResponse.js"
import { createEpisodeStore } from "./storage.js"
import type { EpisodeStore } from "./storage.js"

// 1000 recognisable bytes, so a range can be checked byte for byte.
const AUDIO = Uint8Array.from({ length: 1000 }, (_, index) => index % 251)
const ID = "ai-chips-race-cars-0a1b2c3d"

const get = (query: string, headers: Record<string, string> = {}) =>
  new Request(`http://localhost/api/episode-audio?${query}`, { headers })

describe("serveEpisodeAudio", () => {
  const store: EpisodeStore = { save: vi.fn(), read: vi.fn(async (id) => (id === ID ? AUDIO : undefined)) }
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it("plays the stored MP3: audio/mpeg, the exact bytes, seekable", async () => {
    const response = await serveEpisodeAudio(get(`id=${ID}`), store)

    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe("audio/mpeg")
    expect(response.headers.get("Accept-Ranges")).toBe("bytes")
    expect(response.headers.get("Content-Length")).toBe("1000")
    expect(response.headers.get("Content-Disposition")).toBeNull()
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([...AUDIO])
  })

  it("serves a byte range so the player can seek", async () => {
    const response = await serveEpisodeAudio(get(`id=${ID}`, { Range: "bytes=100-199" }), store)

    expect(response.status).toBe(206)
    expect(response.headers.get("Content-Range")).toBe("bytes 100-199/1000")
    expect(response.headers.get("Content-Length")).toBe("100")
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([...AUDIO.subarray(100, 200)])
  })

  it("supports open-ended and suffix ranges, and refuses one past the end", async () => {
    const open = await serveEpisodeAudio(get(`id=${ID}`, { Range: "bytes=900-" }), store)
    expect(open.headers.get("Content-Range")).toBe("bytes 900-999/1000")
    const suffix = await serveEpisodeAudio(get(`id=${ID}`, { Range: "bytes=-50" }), store)
    expect(suffix.headers.get("Content-Range")).toBe("bytes 950-999/1000")
    const past = await serveEpisodeAudio(get(`id=${ID}`, { Range: "bytes=2000-" }), store)
    expect(past.status).toBe(416)
  })

  it("downloads the same bytes as an attachment named prosperpod-<title>.mp3", async () => {
    const response = await serveEpisodeAudio(get(`id=${ID}&download=1`), store)

    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe("audio/mpeg")
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="prosperpod-ai-chips-race-cars.mp3"')
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([...AUDIO])
  })

  it("never calls ElevenLabs (or anything else) to play or download", async () => {
    await serveEpisodeAudio(get(`id=${ID}`), store)
    await serveEpisodeAudio(get(`id=${ID}`, { Range: "bytes=0-9" }), store)
    await serveEpisodeAudio(get(`id=${ID}&download=1`), store)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("does not expose provider keys in any header", async () => {
    process.env.ELEVENLABS_API_KEY = "xi-secret-key"
    try {
      const response = await serveEpisodeAudio(get(`id=${ID}&download=1`), store)
      expect([...response.headers.entries()].flat().join(" ")).not.toContain("xi-secret-key")
    } finally {
      delete process.env.ELEVENLABS_API_KEY
    }
  })

  it("returns 404 for an episode whose audio is gone, and 400 for an id that is not an episode id", async () => {
    expect((await serveEpisodeAudio(get("id=missing-episode-00000000"), store)).status).toBe(404)
    for (const id of ["", "../secrets", "..%2F..%2Fpackage", "a/b", "A_B", "x".repeat(101)]) {
      expect((await serveEpisodeAudio(get(`id=${id}`), store)).status).toBe(400)
    }
    expect(store.read).not.toHaveBeenCalledWith("../secrets")
  })
})

describe("GET /api/episode-audio with the file store", () => {
  let dir: string
  const savedDir = process.env.EPISODE_STORAGE_DIR

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "prosperpod-test-"))
    process.env.EPISODE_STORAGE_DIR = dir
  })
  afterEach(async () => {
    if (savedDir === undefined) delete process.env.EPISODE_STORAGE_DIR
    else process.env.EPISODE_STORAGE_DIR = savedDir
    await rm(dir, { recursive: true, force: true })
  })

  it("plays and downloads what the pipeline stored, byte for byte", async () => {
    const { id } = await createEpisodeStore().save({ audio: AUDIO, title: "AI Chips & Race Cars" })

    const play = await GET(get(`id=${id}`))
    expect([...new Uint8Array(await play.arrayBuffer())]).toEqual([...AUDIO])
    const download = await GET(get(`id=${id}&download=1`))
    expect(download.headers.get("Content-Disposition")).toBe('attachment; filename="prosperpod-ai-chips-race-cars.mp3"')
    expect([...new Uint8Array(await download.arrayBuffer())]).toEqual([...AUDIO])
  })
})
