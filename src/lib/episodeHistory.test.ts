import { describe, expect, it } from "vitest"
import type { Episode, StoredPodcast } from "@/types"
import { mergeEpisodes, sortByNewest, toEpisode } from "./episodeHistory"

const podcast = (id: string, publishedAt: string, extra: Partial<StoredPodcast> = {}): StoredPodcast => ({
  id,
  title: `Title ${id}`,
  summary: `Summary ${id}`,
  description: `Description ${id}`,
  topics: ["Artificial Intelligence"],
  sources: [{ name: "news.example.com", url: "https://news.example.com/a" }],
  durationSeconds: 560,
  publishedAt,
  audioUrl: `/api/episode-audio?id=${id}`,
  downloadUrl: `/api/episode-audio?id=${id}&download=1`,
  downloadFilename: `prosperpod-${id}.mp3`,
  ...extra,
})

const ids = (episodes: Episode[]) => episodes.map(({ id }) => id)

describe("toEpisode", () => {
  it("keeps the server's date, links and details and adds the cover for the first topic", () => {
    const episode = toEpisode(podcast("a", "2026-09-20T10:00:00.000Z"))
    expect(episode).toMatchObject({
      id: "a",
      title: "Title a",
      publishedAt: "2026-09-20T10:00:00.000Z",
      audioUrl: "/api/episode-audio?id=a",
      downloadUrl: "/api/episode-audio?id=a&download=1",
      downloadFilename: "prosperpod-a.mp3",
    })
    expect(episode.coverGradient).toContain("linear-gradient")
  })

  it("copes with a podcast that has no topics", () => {
    expect(toEpisode(podcast("a", "2026-09-20T10:00:00.000Z", { topics: [] })).coverGradient).toContain("linear-gradient")
  })
})

describe("sortByNewest", () => {
  it("orders by publication time, newest first, and does not change its input", () => {
    const episodes = [podcast("old", "2026-09-18T08:00:00.000Z"), podcast("new", "2026-09-20T23:00:00.000Z"), podcast("mid", "2026-09-19T12:00:00.000Z")].map(toEpisode)
    const sorted = sortByNewest(episodes)
    expect(ids(sorted)).toEqual(["new", "mid", "old"])
    expect(ids(episodes)).toEqual(["old", "new", "mid"])
  })
})

describe("mergeEpisodes", () => {
  it("combines what the browser remembers with what the server stores, one entry per podcast, newest first", () => {
    const remembered = [toEpisode(podcast("a", "2026-09-19T10:00:00.000Z")), toEpisode(podcast("local-only", "2026-09-18T10:00:00.000Z"))]
    const stored = [podcast("b", "2026-09-21T10:00:00.000Z"), podcast("a", "2026-09-19T10:00:00.000Z")]

    expect(ids(mergeEpisodes(remembered, stored))).toEqual(["b", "a", "local-only"])
  })

  it("lets the server's record win for a podcast both know", () => {
    const remembered = [toEpisode(podcast("a", "2026-09-19T10:00:00.000Z", { title: "Stale title" }))]
    const [merged] = mergeEpisodes(remembered, [podcast("a", "2026-09-19T10:00:00.000Z", { title: "Server title" })])
    expect(merged.title).toBe("Server title")
  })

  it("keeps the browser's richer copy when the server only rebuilt the podcast from its audio file", () => {
    const remembered = [toEpisode(podcast("a", "2026-09-19T10:00:00.000Z", { title: "The real title", topics: ["Formula 1"] }))]
    const rebuilt = podcast("a", "2026-09-20T09:00:00.000Z", { title: "Ai Pacing", topics: [], recovered: true })

    const [merged] = mergeEpisodes(remembered, [rebuilt])

    expect(merged.title).toBe("The real title")
    expect(merged.publishedAt).toBe("2026-09-19T10:00:00.000Z")
  })

  it("lists a rebuilt podcast the browser has never seen", () => {
    const merged = mergeEpisodes([], [podcast("a", "2026-09-20T09:00:00.000Z", { recovered: true })])
    expect(ids(merged)).toEqual(["a"])
  })

  it("keeps what is remembered when the server has nothing to add", () => {
    const remembered = [toEpisode(podcast("a", "2026-09-19T10:00:00.000Z"))]
    expect(mergeEpisodes(remembered, [])).toEqual(remembered)
  })

  it("adds a just-generated podcast at the top without duplicating it when the list is fetched afterwards", () => {
    const fresh = podcast("new", "2026-09-21T10:00:00.000Z")
    const afterGenerate = mergeEpisodes([toEpisode(podcast("a", "2026-09-19T10:00:00.000Z"))], [fresh])
    const afterFetch = mergeEpisodes(afterGenerate, [fresh, podcast("a", "2026-09-19T10:00:00.000Z")])

    expect(ids(afterGenerate)).toEqual(["new", "a"])
    expect(ids(afterFetch)).toEqual(["new", "a"])
  })
})
