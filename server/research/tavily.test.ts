import { describe, expect, it, vi } from "vitest"
import { ResearchError } from "./errors.js"
import { createTavilyClient } from "./tavily.js"

function clientReturning(body: unknown, status = 200) {
  const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status }))
  return { client: createTavilyClient({ apiKey: "tvly-secret-key", fetchImpl }), fetchImpl }
}

function callOf(fetchImpl: ReturnType<typeof vi.fn>) {
  const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
  return { url, init, body: JSON.parse(init.body as string) as Record<string, unknown> }
}

async function failureOf(promise: Promise<unknown>): Promise<ResearchError> {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  )
  expect(error).toBeInstanceOf(ResearchError)
  return error as ResearchError
}

describe("createTavilyClient.search", () => {
  it("sends a news search with the key in a header, never in the URL or body", async () => {
    const { client, fetchImpl } = clientReturning({ results: [] })

    await client.search({ query: "Gemini incident", topic: "news" })

    const { url, init, body } = callOf(fetchImpl)
    expect(url).toBe("https://api.tavily.com/search")
    expect(url).not.toContain("tvly-")
    expect(JSON.stringify(body)).not.toContain("tvly-")
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tvly-secret-key")
    expect(body).toMatchObject({ query: "Gemini incident", topic: "news", search_depth: "basic", time_range: "week", include_raw_content: false })
  })

  it("looks further back for a general search", async () => {
    const { client, fetchImpl } = clientReturning({ results: [] })
    await client.search({ query: "SB 53 text", topic: "general" })
    expect(callOf(fetchImpl).body).toMatchObject({ topic: "general", time_range: "month" })
  })

  it("maps results and skips malformed ones", async () => {
    const { client } = clientReturning({
      results: [
        { title: "A", url: "https://a.com/x", content: "snippet", score: 0.9, published_date: "2026-09-18" },
        { title: null, url: "https://b.com/y", content: null, score: null },
        { title: "no url" },
      ],
    })

    expect(await client.search({ query: "q", topic: "news" })).toEqual([
      { title: "A", url: "https://a.com/x", content: "snippet", score: 0.9, publishedDate: "2026-09-18" },
      { title: "", url: "https://b.com/y", content: "", score: null, publishedDate: undefined },
    ])
  })

  it("maps HTTP failures to safe errors that never contain the key", async () => {
    for (const [status, text] of [
      [401, "rejected the API key"],
      [429, "rate limit"],
      [432, "usage limit"],
      [500, "HTTP 500"],
    ] as const) {
      const { client } = clientReturning({ detail: "bad key tvly-secret-key" }, status)
      const error = await failureOf(client.search({ query: "q", topic: "news" }))
      expect(error.kind).toBe("upstream")
      expect(error.message).toContain(text)
      expect(error.message).not.toContain("tvly-")
    }
  })

  it("maps a timeout and a network failure", async () => {
    const timeout = createTavilyClient({
      apiKey: "tvly-secret-key",
      fetchImpl: async () => {
        throw new DOMException("timed out", "TimeoutError")
      },
    })
    expect((await failureOf(timeout.search({ query: "q", topic: "news" }))).kind).toBe("timeout")

    const broken = createTavilyClient({
      apiKey: "tvly-secret-key",
      fetchImpl: async () => {
        throw new Error("connect ECONNREFUSED tvly-secret-key")
      },
    })
    const error = await failureOf(broken.search({ query: "q", topic: "news" }))
    expect(error.kind).toBe("upstream")
    expect(error.message).not.toContain("tvly-")
  })

  it("rejects a response with an unexpected shape or invalid JSON", async () => {
    expect((await failureOf(clientReturning({ nope: true }).client.search({ query: "q", topic: "news" }))).kind).toBe("upstream")

    const notJson = createTavilyClient({ apiKey: "k", fetchImpl: async () => new Response("<html>", { status: 200 }) })
    expect((await failureOf(notJson.search({ query: "q", topic: "news" }))).message).toContain("not valid JSON")
  })
})

describe("createTavilyClient.extract", () => {
  it("requests plain-text extraction and maps successes and failures", async () => {
    const { client, fetchImpl } = clientReturning({
      results: [{ url: "https://a.com/x", raw_content: "Full article text" }],
      failed_results: [{ url: "https://b.com/y", error: "blocked" }],
    })

    const outcome = await client.extract(["https://a.com/x", "https://b.com/y"])

    const { url, body } = callOf(fetchImpl)
    expect(url).toBe("https://api.tavily.com/extract")
    expect(body).toMatchObject({ urls: ["https://a.com/x", "https://b.com/y"], format: "text", extract_depth: "basic" })
    expect(outcome).toEqual({
      extracted: [{ url: "https://a.com/x", content: "Full article text" }],
      failed: [{ url: "https://b.com/y", error: "blocked" }],
    })
  })

  it("does not call Tavily when there is nothing to extract", async () => {
    const { client, fetchImpl } = clientReturning({ results: [] })
    expect(await client.extract([])).toEqual({ extracted: [], failed: [] })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("treats a missing failed_results list as no failures", async () => {
    const { client } = clientReturning({ results: [] })
    expect(await client.extract(["https://a.com/x"])).toEqual({ extracted: [], failed: [] })
  })
})
