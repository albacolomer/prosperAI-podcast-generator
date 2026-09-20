import { describe, expect, it } from "vitest"
import { MAX_RESEARCH_STORIES, parseResearchRequest } from "./request.js"

const article = {
  id: "a",
  title: "Title",
  description: "Description",
  url: "https://example.com/a",
  source: "Example",
  publishedAt: "2026-09-18T10:00:00.000Z",
  interests: ["AI"],
}

const valid = { articles: [article] }

describe("parseResearchRequest", () => {
  it("accepts a valid request, with or without debug", () => {
    expect(parseResearchRequest(valid)).toEqual({ ok: true, request: valid })
    expect(parseResearchRequest({ ...valid, debug: true })).toMatchObject({ ok: true, request: { debug: true } })
  })

  it("rejects a body that is not an object", () => {
    for (const body of [null, "x", 5, []]) expect(parseResearchRequest(body).ok).toBe(false)
  })

  it("rejects no articles, or too many", () => {
    expect(parseResearchRequest({ articles: [] }).ok).toBe(false)
    const many = Array.from({ length: MAX_RESEARCH_STORIES + 1 }, (_, i) => ({ ...article, id: `a${i}` }))
    expect(parseResearchRequest({ articles: many }).ok).toBe(false)
  })

  it("rejects malformed articles and names the failing field", () => {
    for (const [field, value] of [
      ["id", ""],
      ["title", ""],
      ["title", "x".repeat(501)],
      ["description", "x".repeat(2001)],
      ["url", "x".repeat(2049)],
      ["source", 5],
      ["interests", "AI"],
    ] as const) {
      const result = parseResearchRequest({ articles: [{ ...article, [field]: value }] })
      expect(result.ok, `${field}=${String(value).slice(0, 10)}`).toBe(false)
      if (!result.ok) expect(result.message).toContain(field)
    }
  })

  it("rejects a non-boolean debug flag", () => {
    expect(parseResearchRequest({ ...valid, debug: "yes" }).ok).toBe(false)
  })

  it("rejects duplicate article ids", () => {
    const result = parseResearchRequest({ articles: [article, { ...article, title: "Other" }] })
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) expect(result.message).toContain("duplicate article id")
  })
})
