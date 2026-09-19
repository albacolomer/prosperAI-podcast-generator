import { describe, expect, it, vi } from "vitest"
import { createNewsService } from "./service.js"
import { NewsProviderError } from "./types.js"
import type { NewsProvider, SearchParams, SourceArticle } from "./types.js"

const NOW = new Date("2026-09-19T12:00:00Z")

function source(overrides: Partial<SourceArticle>): SourceArticle {
  return {
    title: "A perfectly reasonable headline",
    description: "",
    url: "https://example.com/a",
    source: "Example",
    publishedAt: "2026-09-19T08:00:00Z",
    ...overrides,
  }
}

function fakeProvider(
  handler: (params: SearchParams) => SourceArticle[],
  skippedInvalid = 0,
): NewsProvider & { calls: number } {
  const provider = {
    name: "fake",
    calls: 0,
    searchArticles: vi.fn(async (params: SearchParams) => {
      provider.calls += 1
      return { articles: handler(params), skippedInvalid }
    }),
  }
  return provider
}

function setup(provider: NewsProvider) {
  const log = vi.fn()
  const service = createNewsService({ providers: [provider], now: () => NOW, log })
  return { service, log }
}

describe("news service", () => {
  it("returns one article for a story found under several interests", async () => {
    const shared = source({ url: "https://example.com/shared", title: "Startups race to build climate AI models" })
    const { service } = setup(fakeProvider(() => [shared]))

    const { articles, errors, stats } = await service.fetchCandidateArticles({ interests: ["AI", "Climate"] })

    expect(errors).toEqual([])
    expect(articles).toHaveLength(1)
    expect(articles[0].interests).toEqual(["AI", "Climate"])
    expect(stats).toMatchObject({ raw: 2, invalid: 0, duplicateUrl: 1, similarTitle: 0, final: 1 })
  })

  it("drops invalid and out-of-window articles and counts provider-skipped items", async () => {
    const provider = fakeProvider(
      () => [
        source({ url: "https://example.com/good", title: "A good and recent story" }),
        source({ url: "https://example.com/removed", title: "[Removed]" }),
        source({ url: "not-a-url", title: "Story with a broken link" }),
        source({ url: "https://example.com/old", title: "Story that is far too old", publishedAt: "2026-08-01T00:00:00Z" }),
        source({ url: "https://example.com/bad-date", title: "Story with a broken date", publishedAt: "yesterday" }),
      ],
      2,
    )
    const { service } = setup(provider)

    const { articles, stats } = await service.fetchCandidateArticles({ interests: ["AI"] })

    expect(articles.map((a) => a.url)).toEqual(["https://example.com/good"])
    expect(stats).toMatchObject({ raw: 7, invalid: 6, final: 1 })
  })

  it("does not cap the candidate pool", async () => {
    const subjects = ["Rocket", "Bakery", "Glacier", "Senate", "Violin", "Tornado", "Museum", "Cyclist", "Volcano", "Pharmacy"]
    const many = subjects.map((subject, i) =>
      source({ url: `https://example.com/${i}`, title: `${subject} makes unexpected headlines this week` }),
    )
    const { service } = setup(fakeProvider(() => many))

    const { articles } = await service.fetchCandidateArticles({ interests: ["AI"] })

    expect(articles.length).toBeGreaterThan(8)
  })

  it("reports a failing interest without failing the others", async () => {
    const provider = fakeProvider(({ query }) => {
      if (query === "Broken") throw new NewsProviderError("fake", "rate limit exceeded")
      return [source({ url: `https://example.com/${query}`, title: `Headline about ${query} today` })]
    })
    const { service } = setup(provider)

    const { articles, errors } = await service.fetchCandidateArticles({ interests: ["Space", "Broken"] })

    expect(articles).toHaveLength(1)
    expect(errors).toEqual([{ interest: "Broken", message: "fake: rate limit exceeded" }])
  })

  it("serves repeated requests from the cache", async () => {
    const provider = fakeProvider(() => [source({})])
    const { service } = setup(provider)

    await service.fetchCandidateArticles({ interests: ["AI"] })
    await service.fetchCandidateArticles({ interests: ["ai"] })

    expect(provider.calls).toBe(1)
  })

  it("returns removed articles with reasons only when asked", async () => {
    const provider = fakeProvider(() => [
      source({ url: "https://example.com/a", title: "Central bank raises interest rates again" }),
      source({ url: "https://example.com/a?utm_source=x", title: "Totally different words appear here" }),
      source({ url: "https://other.com/b", title: "Central bank raises interest rates again today" }),
      source({ url: "https://example.com/removed", title: "[Removed]" }),
    ])
    const { service } = setup(provider)

    const plain = await service.fetchCandidateArticles({ interests: ["Finance"] })
    expect(plain.removed).toBeUndefined()

    const debug = await service.fetchCandidateArticles({ interests: ["Finance"], includeRemoved: true })
    expect(debug.removed?.map((r) => r.reason).sort()).toEqual(["duplicate-url", "invalid", "similar-title"])
    expect(debug.stats).toMatchObject({ raw: 4, invalid: 1, duplicateUrl: 1, similarTitle: 1, final: 1 })
  })

  it("logs the pipeline steps without leaking secrets", async () => {
    const provider = fakeProvider(() => [
      source({ url: "https://example.com/a", title: "Central bank raises interest rates again" }),
      source({ url: "https://example.com/a", title: "Central bank raises interest rates again" }),
    ])
    const { service, log } = setup(provider)

    await service.fetchCandidateArticles({ interests: ["Finance"] })

    const lines = log.mock.calls.map(([line]) => line as string)
    expect(lines).toContain("Interests (1): Finance")
    expect(lines).toContain("Raw articles: 2")
    expect(lines).toContain("Duplicate URLs removed: 1")
    expect(lines).toContain("Final articles: 1")
    expect(lines.some((line) => line.startsWith("Removed duplicate URL:"))).toBe(true)
    expect(lines.join("\n")).not.toMatch(/apikey|secret/i)
  })
})
