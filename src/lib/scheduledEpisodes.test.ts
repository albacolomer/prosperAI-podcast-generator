import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Episode, StoredPodcast } from "@/types"
import { fetchStoredEpisodes } from "./episodeApi"
import { mergeEpisodes, sortByNewest } from "./episodeHistory"

const podcast = (id: string, publishedAt: string): StoredPodcast => ({
  id,
  title: `Title ${id}`,
  summary: "Summary",
  description: "Description",
  topics: ["Artificial Intelligence"],
  sources: [],
  durationSeconds: 560,
  publishedAt,
  audioUrl: `/api/episode-audio?id=${id}`,
  downloadUrl: `/api/episode-audio?id=${id}&download=1`,
  downloadFilename: `prosperpod-${id}.mp3`,
})

describe("an episode the schedule generated while nobody was looking", () => {
  const fetchMock = vi.fn<typeof fetch>()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it("appears, as the newest episode, when the list is fetched again, with no other episode lost", async () => {
    const earlier = podcast("earlier-00000001", "2026-09-20T18:00:00.000Z")
    const scheduled = podcast("morning-briefing-00000002", "2026-09-21T05:52:00.000Z")

    // What the page has on screen: the first fetch.
    fetchMock.mockResolvedValueOnce(Response.json({ episodes: [earlier] }))
    let shown: Episode[] = mergeEpisodes([], await fetchStoredEpisodes())
    expect(shown.map(({ id }) => id)).toEqual([earlier.id])

    // The server generated an episode at 07:52 while the tab was open. The next poll (or a refresh) finds it.
    fetchMock.mockResolvedValueOnce(Response.json({ episodes: [scheduled, earlier] }))
    shown = mergeEpisodes(shown, await fetchStoredEpisodes())

    expect(shown.map(({ id }) => id)).toEqual([scheduled.id, earlier.id])
    expect(shown[0]).toMatchObject({ title: "Title morning-briefing-00000002", audioUrl: "/api/episode-audio?id=morning-briefing-00000002" })
  })

  it("appears after a full page reload too, from the server's list alone", async () => {
    const scheduled = podcast("morning-briefing-00000002", "2026-09-21T05:52:00.000Z")
    fetchMock.mockResolvedValueOnce(Response.json({ episodes: [scheduled] }))

    const shown = sortByNewest(mergeEpisodes([], await fetchStoredEpisodes()))

    expect(shown.map(({ id }) => id)).toEqual([scheduled.id])
  })

  it("keeps what is on screen when the server cannot be reached for a poll", async () => {
    const earlier = podcast("earlier-00000001", "2026-09-20T18:00:00.000Z")
    const shown = mergeEpisodes([], [earlier])
    fetchMock.mockResolvedValueOnce(new Response("down", { status: 503 }))

    await expect(fetchStoredEpisodes()).rejects.toThrow()

    expect(shown.map(({ id }) => id)).toEqual([earlier.id])
  })
})
