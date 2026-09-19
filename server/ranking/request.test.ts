import { describe, expect, it } from "vitest"
import { MAX_CANDIDATES, MAX_STORIES, parseRankRequest } from "./request.js"

const article = (id: string) => ({
  id,
  title: `Title ${id}`,
  description: "A description",
  url: `https://example.com/${id}`,
  source: "Example",
  publishedAt: "2026-09-18T10:00:00.000Z",
  interests: ["AI"],
})

const valid = { interests: ["AI"], articles: [article("a"), article("b")], maxStories: 5 }

describe("parseRankRequest", () => {
  it("accepts a well-formed request", () => {
    const result = parseRankRequest(valid)
    expect(result.ok && result.request.maxStories).toBe(5)
    expect(result.ok && result.request.articles).toHaveLength(2)
  })

  it("rejects a body that is not an object", () => {
    expect(parseRankRequest(null).ok).toBe(false)
    expect(parseRankRequest("nope").ok).toBe(false)
  })

  it("rejects missing or empty interests", () => {
    expect(parseRankRequest({ ...valid, interests: [] }).ok).toBe(false)
    expect(parseRankRequest({ ...valid, interests: undefined }).ok).toBe(false)
    expect(parseRankRequest({ ...valid, interests: ["  "] }).ok).toBe(false)
  })

  it("rejects missing, empty or oversized article lists", () => {
    expect(parseRankRequest({ ...valid, articles: [] }).ok).toBe(false)
    expect(parseRankRequest({ ...valid, articles: undefined }).ok).toBe(false)
    const tooMany = Array.from({ length: MAX_CANDIDATES + 1 }, (_, i) => article(`id${i}`))
    expect(parseRankRequest({ ...valid, articles: tooMany }).ok).toBe(false)
  })

  it("rejects malformed articles", () => {
    expect(parseRankRequest({ ...valid, articles: [{ id: "a", title: "only a title" }] }).ok).toBe(false)
    expect(parseRankRequest({ ...valid, articles: [{ ...article("a"), title: "" }] }).ok).toBe(false)
  })

  it("rejects duplicate article ids", () => {
    const result = parseRankRequest({ ...valid, articles: [article("a"), article("a")] })
    expect(result.ok).toBe(false)
    expect(!result.ok && result.message).toContain("duplicate article id")
  })

  it("rejects an invalid maxStories", () => {
    for (const maxStories of [0, -1, 2.5, MAX_STORIES + 1, "5", undefined]) {
      expect(parseRankRequest({ ...valid, maxStories }).ok).toBe(false)
    }
  })
})
