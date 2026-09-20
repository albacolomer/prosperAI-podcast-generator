import { describe, expect, it } from "vitest"
import type { Article, EnrichedStory } from "@/types"
import { storiesForScript, storiesFromRanking } from "./scriptApi"
import type { RankedArticle, ResearchOutcome } from "./scriptApi"

const article = (id: string): Article => ({
  id,
  title: `Title ${id}`,
  description: `Description of ${id}`,
  url: `https://example.com/${id}`,
  source: "Example",
  publishedAt: "2026-09-18T10:00:00.000Z",
  interests: ["AI"],
})

const ranked = (id: string, rank: number): RankedArticle => ({ article: article(id), rank, reason: `Why ${id}` })

const researched = (id: string, overrides: Partial<EnrichedStory> = {}): EnrichedStory => ({
  storyId: id,
  headline: `Headline ${id}`,
  summary: "Summary",
  facts: [{ claim: "A fact", sourceIds: ["s1"] }],
  context: [],
  analysis: [],
  quotes: [],
  disagreements: [],
  sources: [{ id: "s1", title: "Source", url: "https://news.example.com/x", domain: "news.example.com", type: "reporting" }],
  status: "enriched",
  ...overrides,
})

const done = (story: EnrichedStory): ResearchOutcome => ({ status: "done", story })

describe("storiesForScript", () => {
  it("keeps the enriched stories in ranking order, with their rank", () => {
    const { stories, excluded } = storiesForScript([ranked("a", 1), ranked("b", 2), ranked("c", 3)], {
      a: done(researched("a")),
      b: done(researched("b")),
      c: done(researched("c")),
    })
    expect(stories.map(({ rank, story }) => [rank, story.storyId])).toEqual([[1, "a"], [2, "b"], [3, "c"]])
    expect(excluded).toEqual([])
  })

  it("leaves out stories Research marked insufficient or failed, and says why", () => {
    const { stories, excluded } = storiesForScript([ranked("a", 1), ranked("b", 2), ranked("c", 3)], {
      a: done(researched("a")),
      b: done(researched("b", { status: "insufficient", statusReason: "No usable source could be read", facts: [] })),
      c: done(researched("c", { status: "failed", statusReason: "Research timed out", facts: [] })),
    })
    expect(stories.map(({ story }) => story.storyId)).toEqual(["a"])
    expect(excluded).toEqual([
      { articleId: "b", title: "Title b", reason: "insufficient: No usable source could be read" },
      { articleId: "c", title: "Title c", reason: "failed: Research timed out" },
    ])
  })

  it("leaves out stories whose research request failed, is still running or never started", () => {
    const { stories, excluded } = storiesForScript([ranked("a", 1), ranked("b", 2), ranked("c", 3)], {
      a: { status: "error", message: "Research request failed (502)" },
      b: { status: "loading" },
    })
    expect(stories).toEqual([])
    expect(excluded.map(({ articleId, reason }) => [articleId, reason])).toEqual([
      ["a", "failed: Research request failed (502)"],
      ["b", "not researched yet"],
      ["c", "not researched yet"],
    ])
  })

  it("keeps each story's original rank, so dropped stories leave gaps rather than renumbering", () => {
    const { stories } = storiesForScript([ranked("a", 1), ranked("b", 2), ranked("c", 3), ranked("d", 4)], {
      a: done(researched("a")),
      b: done(researched("b", { status: "insufficient" })),
      c: done(researched("c", { status: "failed" })),
      d: done(researched("d")),
    })
    expect(stories.map(({ rank }) => rank)).toEqual([1, 4])
  })

  it("never sends the debug trace, and leaves the research state untouched", () => {
    const trace = { queries: [], candidates: [], extractions: [], synthesisRuns: 1, notes: ["internal"] }
    const original = researched("a", { trace })
    const { stories } = storiesForScript([ranked("a", 1)], { a: done(original) })

    expect(stories[0].story).not.toHaveProperty("trace")
    expect(JSON.stringify(stories)).not.toContain("internal")
    expect(original.trace).toBe(trace)
  })

  it("passes everything else Research produced through unchanged", () => {
    const original = researched("a", {
      context: [{ claim: "Background", sourceIds: ["s1"] }],
      analysis: [{ claim: "Reading", sourceIds: ["s1"] }],
      quotes: [{ text: "Exact words", speaker: "Someone", sourceId: "s1" }],
    })
    const { stories } = storiesForScript([ranked("a", 1)], { a: done(original) })
    expect(stories[0].story).toEqual(original)
  })

  it("returns nothing to script when no story was enriched", () => {
    const { stories, excluded } = storiesForScript([ranked("a", 1)], { a: done(researched("a", { status: "insufficient" })) })
    expect(stories).toEqual([])
    expect(excluded).toHaveLength(1)
  })
})

describe("storiesFromRanking", () => {
  it("pairs the ranker's selection with its articles, in ranking order, skipping unknown ids", () => {
    const paired = storiesFromRanking(
      [
        { articleId: "b", rank: 1, reason: "Top" },
        { articleId: "missing", rank: 2, reason: "?" },
        { articleId: "a", rank: 3, reason: "Next" },
      ],
      [article("a"), article("b")],
    )
    expect(paired.map(({ article: { id }, rank }) => [id, rank])).toEqual([["b", 1], ["a", 3]])
  })
})
