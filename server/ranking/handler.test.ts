import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "../../api/rank-news.js"

const article = {
  id: "a",
  title: "Title",
  description: "Description",
  url: "https://example.com/a",
  source: "Example",
  publishedAt: "2026-09-18T10:00:00.000Z",
  interests: ["AI"],
}

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/rank-news", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  )
}

describe("POST /api/rank-news", () => {
  const originalKey = process.env.OPENAI_API_KEY

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = originalKey
  })

  it("returns 400 for a body that is not JSON", async () => {
    expect((await post("{nope")).status).toBe(400)
  })

  it("returns 400 for a malformed request, before touching OpenAI", async () => {
    process.env.OPENAI_API_KEY = "sk-test"
    const response = await post({ interests: [], articles: [article], maxStories: 3 })
    expect(response.status).toBe(400)
    expect(((await response.json()) as { error: string }).error).toContain("interests")
  })

  it("returns 503 without leaking anything when the OpenAI key is missing", async () => {
    delete process.env.OPENAI_API_KEY
    const response = await post({ interests: ["AI"], articles: [article], maxStories: 3 })

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: "Ranking is not configured" })
  })
})
