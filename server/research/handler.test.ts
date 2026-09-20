import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "../../api/research-news.js"
import { ResearchError } from "./errors.js"
import type { ResearchModel } from "./researcher.js"
import type { TavilyClient } from "./tavily.js"

// The handler builds its clients through these factories; tests swap in fakes so no network is ever used.
const createModel = vi.hoisted(() => vi.fn<(config: { apiKey: string; modelName: string }) => ResearchModel>())
const createTavily = vi.hoisted(() => vi.fn<(config: { apiKey: string }) => TavilyClient>())
vi.mock("./openai.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./openai.js")>()),
  createOpenAiResearchModel: createModel,
}))
vi.mock("./tavily.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./tavily.js")>()),
  createTavilyClient: createTavily,
}))

const article = {
  id: "a",
  title: "Google confirms Gemini security incident",
  description: "Description",
  url: "https://example.com/a",
  source: "Example",
  publishedAt: "2026-09-18T10:00:00.000Z",
  interests: ["AI"],
}

const valid = { articles: [article] }

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/research-news", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  )
}

/** A Tavily client that finds nothing, so a story ends "insufficient" without any model call. */
const emptyTavily: TavilyClient = { search: async () => [], extract: async () => ({ extracted: [], failed: [] }) }
const passingModel: ResearchModel = {
  select: async () => JSON.stringify({ selected: [], rejected: [], followUp: null }),
  synthesize: async () => {
    throw new Error("not expected")
  },
}

const ENV_KEYS = ["OPENAI_API_KEY", "TAVILY_API_KEY", "OPENAI_RESEARCH_MODEL"] as const

describe("POST /api/research-news", () => {
  const original = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]))

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.spyOn(console, "log").mockImplementation(() => {})
    createModel.mockReset()
    createTavily.mockReset()
    process.env.OPENAI_API_KEY = "sk-secret-key"
    process.env.TAVILY_API_KEY = "tvly-secret-key"
    delete process.env.OPENAI_RESEARCH_MODEL
  })

  afterEach(() => {
    vi.restoreAllMocks()
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) delete process.env[key]
      else process.env[key] = original[key]
    }
  })

  it("returns 400 for a body that is not JSON", async () => {
    expect((await post("{nope")).status).toBe(400)
  })

  it("returns 413 for an oversized body", async () => {
    expect((await post("x".repeat(1_000_001))).status).toBe(413)
  })

  it("returns 400 for a malformed request, before touching Tavily or OpenAI", async () => {
    for (const body of [{ articles: [] }, { articles: [{ ...article, title: "" }] }, { articles: [article, article] }, { articles: [article], debug: "yes" }]) {
      const response = await post(body)
      expect(response.status).toBe(400)
      expect(((await response.json()) as { error: string }).error).toMatch(/articles|debug/)
    }
    expect(createModel).not.toHaveBeenCalled()
    expect(createTavily).not.toHaveBeenCalled()
  })

  it("returns 503 without leaking anything when either key is missing", async () => {
    for (const missing of ["OPENAI_API_KEY", "TAVILY_API_KEY"] as const) {
      process.env.OPENAI_API_KEY = "sk-secret-key"
      process.env.TAVILY_API_KEY = "tvly-secret-key"
      delete process.env[missing]

      const response = await post(valid)
      const text = await response.text()
      expect(response.status).toBe(503)
      expect(JSON.parse(text)).toEqual({ error: "Research is not configured" })
      expect(text).not.toContain("secret")
    }
    expect(createModel).not.toHaveBeenCalled()
  })

  it("returns the research result on success, without echoing any key, and passes the keys to the factories", async () => {
    createTavily.mockReturnValue(emptyTavily)
    createModel.mockReturnValue(passingModel)

    const response = await post(valid)
    const text = await response.text()

    expect(response.status).toBe(200)
    expect(text).not.toContain("sk-")
    expect(text).not.toContain("tvly-")
    const body = JSON.parse(text) as { stories: { storyId: string; status: string; trace?: unknown }[]; stats: { requested: number; model: string } }
    expect(body.stories).toMatchObject([{ storyId: "a", status: "insufficient" }])
    expect(body.stories[0].trace).toBeUndefined()
    expect(body.stats).toMatchObject({ requested: 1, insufficient: 1, model: "gpt-5-mini" })
    expect(createTavily).toHaveBeenCalledWith({ apiKey: "tvly-secret-key" })
    expect(createModel).toHaveBeenCalledWith({ apiKey: "sk-secret-key", modelName: "gpt-5-mini" })
  })

  it("includes the trace only for debug requests", async () => {
    createTavily.mockReturnValue(emptyTavily)
    createModel.mockReturnValue(passingModel)

    const body = (await (await post({ ...valid, debug: true })).json()) as { stories: { trace?: { queries: unknown[] } }[] }
    expect(body.stories[0].trace?.queries).toHaveLength(1)
  })

  it("uses OPENAI_RESEARCH_MODEL when set", async () => {
    process.env.OPENAI_RESEARCH_MODEL = "custom-model"
    createTavily.mockReturnValue(emptyTavily)
    createModel.mockReturnValue(passingModel)

    const body = (await (await post(valid)).json()) as { stats: { model: string } }
    expect(body.stats.model).toBe("custom-model")
  })

  it("reports a Tavily failure as a failed story with a safe message rather than failing the request", async () => {
    createTavily.mockReturnValue({
      search: async () => {
        throw new ResearchError("upstream", "Tavily rejected the API key")
      },
      extract: async () => ({ extracted: [], failed: [] }),
    })
    createModel.mockReturnValue(passingModel)

    const response = await post(valid)
    const text = await response.text()
    expect(response.status).toBe(200)
    expect(JSON.parse(text)).toMatchObject({ stories: [{ status: "failed", statusReason: "Tavily rejected the API key" }] })
    expect(text).not.toContain("tvly-")
  })

  it("reports an OpenAI failure as a failed story with a safe message", async () => {
    createTavily.mockReturnValue(emptyTavily)
    createModel.mockReturnValue({
      ...passingModel,
      select: async () => {
        throw new ResearchError("timeout", "The research request to OpenAI timed out")
      },
    })

    const body = (await (await post(valid)).json()) as { stories: { status: string; statusReason: string }[] }
    expect(body.stories[0]).toMatchObject({ status: "failed", statusReason: "The research request to OpenAI timed out" })
  })

  it("returns a generic 500 for unexpected failures outside a story, without leaking details", async () => {
    createTavily.mockImplementation(() => {
      throw new Error("boom sk-secret-key tvly-secret-key")
    })

    const response = await post(valid)
    const text = await response.text()
    expect(response.status).toBe(500)
    expect(text).not.toContain("sk-")
    expect(text).not.toContain("tvly-")
    expect(text).not.toContain("boom")
  })

  it("maps a ResearchError raised outside a story to its status", async () => {
    createTavily.mockImplementation(() => {
      throw new ResearchError("timeout", "safe timeout message")
    })
    const response = await post(valid)
    expect(response.status).toBe(504)
    expect(await response.json()).toEqual({ error: "safe timeout message" })
  })
})
