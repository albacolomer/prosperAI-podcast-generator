import { describe, expect, it } from "vitest"
import type { Article } from "../../src/types/article.js"
import { dedupeArticles } from "./dedupe.js"
import { canonicalizeUrl, normalizeTitle } from "./normalize.js"

function article(overrides: Partial<Article>): Article {
  return {
    id: "id",
    title: "Default headline about something",
    description: "",
    url: "https://example.com/a",
    source: "Example",
    publishedAt: "2026-09-19T08:00:00Z",
    interests: ["AI"],
    ...overrides,
  }
}

describe("canonicalizeUrl", () => {
  it("strips tracking params, fragments, www and trailing slashes", () => {
    expect(canonicalizeUrl("https://www.example.com/story/?utm_source=x&id=7#comments")).toBe(
      "https://example.com/story?id=7",
    )
  })

  it("rejects non-http(s) and malformed URLs", () => {
    expect(canonicalizeUrl("javascript:alert(1)")).toBeNull()
    expect(canonicalizeUrl("not a url")).toBeNull()
  })
})

describe("normalizeTitle", () => {
  it("drops a trailing source suffix only when it matches the source", () => {
    expect(normalizeTitle("OpenAI ships GPT-6 - Reuters", "Reuters")).toBe("openai ships gpt 6")
    expect(normalizeTitle("OpenAI ships GPT-6 - Reuters", "BBC")).toBe("openai ships gpt 6 reuters")
  })
})

describe("dedupeArticles", () => {
  it("merges the same URL with different tracking params", () => {
    const { kept, removed } = dedupeArticles([
      article({ url: "https://example.com/a?utm_source=x" }),
      article({ url: "https://www.example.com/a/", interests: ["Startups"] }),
    ])
    expect(kept).toHaveLength(1)
    expect(kept[0].interests).toEqual(["AI", "Startups"])
    expect(removed.map((r) => r.reason)).toEqual(["duplicate-url"])
  })

  it("merges near-identical titles from different outlets", () => {
    const { kept, removed } = dedupeArticles([
      article({ url: "https://a.com/1", title: "SpaceX launches Starship on record breaking test flight" }),
      article({
        url: "https://b.com/2",
        title: "SpaceX launches Starship on record-breaking test flight - Reuters",
        source: "Reuters",
        interests: ["Space"],
      }),
    ])
    expect(kept).toHaveLength(1)
    expect(kept[0].interests).toEqual(["AI", "Space"])
    expect(removed.map((r) => r.reason)).toEqual(["similar-title"])
  })

  it("keeps genuinely different stories and does not mutate its input", () => {
    const first = article({ url: "https://a.com/1", title: "Central bank raises interest rates again" })
    const second = article({ url: "https://b.com/2", title: "Formula 1 team unveils surprise new car livery" })
    expect(dedupeArticles([first, second]).kept).toHaveLength(2)

    dedupeArticles([first, { ...first, url: "https://c.com/3", interests: ["Finance"] }])
    expect(first.interests).toEqual(["AI"])
  })
})
