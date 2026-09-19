import { describe, expect, it, vi } from "vitest"
import { NewsProviderError } from "../types.js"
import { GNewsProvider } from "./gnews.js"

const validArticle = {
  title: "  Big <b>AI</b> breakthrough announced  ",
  description: null,
  url: "https://example.com/story",
  image: "https://example.com/img.jpg",
  publishedAt: "2026-09-19T08:00:00Z",
  source: { name: "Example News", url: "https://example.com" },
}

function providerReturning(body: unknown, status = 200) {
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify(body), { status }))
  return { provider: new GNewsProvider("secret-key", { fetchImpl }), fetchImpl }
}

describe("GNewsProvider", () => {
  it("maps valid articles, skips malformed ones and counts them", async () => {
    const { provider } = providerReturning({
      articles: [validArticle, { title: "missing everything else" }, { ...validArticle, image: "javascript:x" }],
    })

    const { articles, skippedInvalid } = await provider.searchArticles({ query: "AI" })

    expect(skippedInvalid).toBe(1)
    expect(articles).toHaveLength(2)
    expect(articles[0]).toMatchObject({
      title: "Big AI breakthrough announced",
      description: "",
      source: "Example News",
      imageUrl: "https://example.com/img.jpg",
    })
    expect(articles[1].imageUrl).toBeUndefined()
  })

  it("sends a quoted query, language and date window", async () => {
    const { provider, fetchImpl } = providerReturning({ articles: [] })

    await provider.searchArticles({
      query: "Formula 1",
      language: "en",
      from: new Date("2026-09-16T08:00:00.123Z"),
    })

    const url = new URL((fetchImpl.mock.calls[0] as unknown as [string])[0])
    expect(url.searchParams.get("q")).toBe('"Formula 1"')
    expect(url.searchParams.get("lang")).toBe("en")
    expect(url.searchParams.get("from")).toBe("2026-09-16T08:00:00Z")
  })

  it("throws a provider error without leaking the API key", async () => {
    const { provider } = providerReturning({ errors: ["nope"] }, 429)

    const error = await provider.searchArticles({ query: "AI" }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(NewsProviderError)
    expect((error as Error).message).toContain("rate limit")
    expect((error as Error).message).not.toContain("secret-key")
  })

  it("rejects a response with an unexpected shape", async () => {
    const { provider } = providerReturning({ something: "else" })
    await expect(provider.searchArticles({ query: "AI" })).rejects.toThrow("unexpected response shape")
  })
})

describe("GNewsProvider throttling", () => {
  function throttledProvider(handler: (call: number) => Response | Promise<Response>, requestDurationMs = 0) {
    let clock = 0
    const startTimes: number[] = []
    let active = 0
    let maxActive = 0

    const fetchImpl = vi.fn(async () => {
      startTimes.push(clock)
      active += 1
      maxActive = Math.max(maxActive, active)
      await Promise.resolve()
      clock += requestDurationMs
      try {
        return await handler(startTimes.length)
      } finally {
        active -= 1
      }
    })
    const provider = new GNewsProvider("secret-key", {
      fetchImpl,
      minRequestIntervalMs: 1100,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms
      },
    })
    return { provider, startTimes, maxActive: () => maxActive }
  }

  const ok = () => new Response(JSON.stringify({ articles: [] }))

  it("runs concurrent searches one at a time, with 1.1s of quiet after each finishes", async () => {
    const { provider, startTimes, maxActive } = throttledProvider(ok, 500)

    await Promise.all(["A", "B", "C"].map((query) => provider.searchArticles({ query })))

    // Each request takes 500ms, so starts are 500 + 1100 apart.
    expect(startTimes).toEqual([0, 1600, 3200])
    expect(maxActive()).toBe(1)
  })

  it("keeps serving queued searches after one fails", async () => {
    const { provider, startTimes } = throttledProvider((call) =>
      call === 1 ? new Response("{}", { status: 500 }) : ok(),
    )

    const results = await Promise.allSettled(["A", "B"].map((query) => provider.searchArticles({ query })))

    expect(results.map((r) => r.status)).toEqual(["rejected", "fulfilled"])
    expect(startTimes).toEqual([0, 1100])
  })
})
