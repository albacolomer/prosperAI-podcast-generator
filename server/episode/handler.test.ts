import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "../../api/generate-episode.js"
import type { GenerationEvent } from "../../src/types/generation.js"
import type { Article } from "../../src/types/article.js"
import { enrichedStory } from "../script/fixtures.js"
import { handleGenerateEpisode } from "./handler.js"
import type { PipelineDeps } from "./pipeline.js"
import { createPipelineServices } from "./services.js"
import { happyDeps, MP3, request, scriptResponse } from "./testKit.js"

const ENV = {
  GNEWS_API_KEY: "gnews-secret",
  OPENAI_API_KEY: "sk-secret-key",
  TAVILY_API_KEY: "tvly-secret",
  ELEVENLABS_API_KEY: "xi-secret-key",
  ELEVENLABS_VOICE_ID: "JBFqnCBsd6RMkjVDRZzb",
} as NodeJS.ProcessEnv

function post(body: unknown) {
  return new Request("http://localhost/api/generate-episode", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) })
}

async function events(response: Response): Promise<GenerationEvent[]> {
  const text = await response.text()
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as GenerationEvent)
}

const run = (body: unknown, deps: PipelineDeps = happyDeps()) => {
  const { onProgress: _p, signal: _s, log: _l, clock: _c, ...services } = deps
  return handleGenerateEpisode(post(body), { env: ENV, createServices: () => services })
}

describe("POST /api/generate-episode", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.spyOn(console, "log").mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it("streams progress and then the episode, without an audio token, keys or a voice", async () => {
    const response = await run(request)

    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toContain("application/x-ndjson")
    const stream = await events(response)
    expect(stream.filter((event) => event.type === "progress")).toHaveLength(14)
    const last = stream.at(-1)
    expect(last?.type).toBe("result")

    const text = JSON.stringify(stream)
    for (const secret of Object.values(ENV)) expect(text).not.toContain(secret as string)
    expect(text).not.toContain("audioToken")
    expect(text).not.toMatch(/voice/i)
  })

  it("accepts the settings alone: no voice is required", async () => {
    expect((await run(request)).status).toBe(200)
  })

  it("ignores a voice a client sends anyway", async () => {
    const deps = happyDeps()
    const response = await run({ ...request, voiceId: "SOMEOTHERVOICE12345", voice: "nova" }, deps)
    expect((await events(response)).at(-1)?.type).toBe("result")
    // The voice step only ever receives the script: the voice is fixed inside it, from the server's configuration.
    expect(deps.voice).toHaveBeenCalledWith("Welcome. Stories. Bye.")
    expect(deps.voice).toHaveBeenCalledTimes(1)
  })

  it("passes the request's settings on to the pipeline, always with a 10-minute duration", async () => {
    const deps = happyDeps()
    await (await run({ ...request, language: "fr", tone: "journalistic", durationMinutes: 20 }, deps)).text()
    expect(deps.news.fetchCandidateArticles).toHaveBeenCalledWith({ interests: request.interests })
    expect(vi.mocked(deps.script).mock.calls[0][0]).toMatchObject({ language: "fr", tone: "journalistic", durationMinutes: 10 })

    const without = happyDeps()
    await (await run({ interests: request.interests, language: "en", tone: "conversational" }, without)).text()
    expect(vi.mocked(without.script).mock.calls[0][0]).toMatchObject({ durationMinutes: 10 })
  })

  it("reports a failed stage as an error event with the safe message", async () => {
    const cases: [Partial<PipelineDeps>, string, string][] = [
      [
        { research: vi.fn(async (articles: Article[]) => ({ stories: articles.map(({ id }) => enrichedStory(id, { status: "failed" })), stats: { requested: 2, enriched: 0, insufficient: 0, failed: 2, model: "m", tavilySearches: 0, tavilyExtractions: 0, durationMs: 1 } })) },
        "research",
        "We couldn't research enough stories to generate this episode.",
      ],
      [{ script: vi.fn(async () => Promise.reject(new Error("sk-secret-key leaked"))) }, "script", "We couldn't generate a reliable script for this episode."],
      [
        { script: vi.fn(async () => scriptResponse(["a", "b"], { validation: { passed: false, issues: [], stats: { wordCount: 1, targetWords: 1, maxWords: 1, minWords: 1, storiesPlanned: 1, storiesCovered: 1, quotesUsed: 0, errors: 2, warnings: 0, aiReview: "issues" } } })) },
        "validation",
        "We couldn't validate this episode reliably.",
      ],
      [{ voice: vi.fn(async () => Promise.reject(new Error("xi-secret-key rejected"))) }, "audio", "The episode script was generated, but we couldn't generate the audio."],
    ]
    for (const [override, stage, message] of cases) {
      const stream = await events(await run(request, happyDeps(override)))
      expect(stream.at(-1)).toEqual({ type: "error", stage, message })
      expect(JSON.stringify(stream)).not.toMatch(/sk-secret-key|xi-secret-key/)
    }
  })

  it("reports an unexpected failure generically, without a stack trace", async () => {
    const deps = happyDeps()
    deps.store.save = vi.fn(async () => {
      throw new EvalError("internal detail")
    })
    const stream = await events(await run(request, deps))
    expect(stream.at(-1)).toMatchObject({ type: "error", stage: "storage" })
    expect(JSON.stringify(stream)).not.toContain("internal detail")
  })

  it("returns 400 for a body that is not JSON or is malformed, before spending anything", async () => {
    const deps = happyDeps()
    expect((await run("{nope", deps)).status).toBe(400)
    expect((await run({ ...request, interests: [] }, deps)).status).toBe(400)
    expect((await run({ ...request, language: "klingon" }, deps)).status).toBe(400)
    expect((await run({ ...request, tone: "angry" }, deps)).status).toBe(400)
    expect(deps.news.fetchCandidateArticles).not.toHaveBeenCalled()
  })

  it("returns 413 for an oversized body", async () => {
    expect((await run("x".repeat(10_001))).status).toBe(413)
  })

  it("returns 503 with a generic message when a key or the voice is not configured", async () => {
    for (const name of Object.keys(ENV)) {
      const env = { ...ENV }
      delete env[name]
      const response = await handleGenerateEpisode(post(request), { env, createServices: () => happyDeps() })
      expect(response.status).toBe(503)
      expect(await response.json()).toEqual({ error: "Episode generation is not configured" })
    }
  })

  describe("ElevenLabs preflight", () => {
    const bad: [string, Record<string, string>, RegExp][] = [
      ["a malformed voice id", { ELEVENLABS_VOICE_ID: '"JBFqnCBsd6RMkjVDRZzb"' }, /ELEVENLABS_VOICE_ID is not a valid/],
      ["a key with a trailing line break", { ELEVENLABS_API_KEY: "xi-secret-key\n" }, /ELEVENLABS_API_KEY contains spaces/],
      ["an unsupported model", { ELEVENLABS_MODEL_ID: "eleven_typo_v9" }, /ELEVENLABS_MODEL_ID is not a supported model/],
    ]

    it.each(bad)("answers 503 with a specific message, and starts no stage, for %s", async (_name, override, message) => {
      const deps = happyDeps()
      const { onProgress: _p, signal: _s, log: _l, clock: _c, ...services } = deps
      const createServices = vi.fn(() => services)
      const response = await handleGenerateEpisode(post(request), { env: { ...ENV, ...override } as NodeJS.ProcessEnv, createServices })

      expect(response.status).toBe(503)
      expect(response.headers.get("Content-Type")).toContain("application/json")
      const { error } = (await response.json()) as { error: string }
      expect(error).toMatch(message)
      expect(error).not.toMatch(/xi-secret-key|JBFqnCBsd6RMkjVDRZzb|eleven_typo_v9/)
      // Nothing that costs money was set up or called.
      expect(createServices).not.toHaveBeenCalled()
      expect(deps.news.fetchCandidateArticles).not.toHaveBeenCalled()
      expect(deps.rank).not.toHaveBeenCalled()
      expect(deps.research).not.toHaveBeenCalled()
      expect(deps.script).not.toHaveBeenCalled()
      expect(deps.voice).not.toHaveBeenCalled()
    })

    it("lets a valid configuration through to the pipeline", async () => {
      const deps = happyDeps()
      const response = await run(request, deps)
      expect(response.status).toBe(200)
      expect((await events(response)).at(-1)?.type).toBe("result")
    })

    it("lets eleven_flash_v2_5 through to the pipeline, which voices the script once", async () => {
      const deps = happyDeps()
      const { onProgress: _p, signal: _s, log: _l, clock: _c, ...services } = deps
      const env = { ...ENV, ELEVENLABS_MODEL_ID: "eleven_flash_v2_5" } as NodeJS.ProcessEnv
      const response = await handleGenerateEpisode(post(request), { env, createServices: () => services })

      expect(response.status).toBe(200)
      expect((await events(response)).at(-1)?.type).toBe("result")
      expect(deps.voice).toHaveBeenCalledTimes(1)
    })
  })

  it("the real endpoint is wired to the same handler", async () => {
    const saved = { ...process.env }
    for (const name of Object.keys(ENV)) delete process.env[name]
    try {
      expect((await POST(post(request))).status).toBe(503)
    } finally {
      Object.assign(process.env, saved)
    }
  })
})

describe("the voice step of the real services", () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {})
    fetchMock.mockReset()
    fetchMock.mockImplementation(async () => new Response(MP3, { headers: { "Content-Type": "audio/mpeg" } }))
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("voices with ELEVENLABS_VOICE_ID and ELEVENLABS_MODEL_ID from the server's configuration", async () => {
    const services = createPipelineServices({ ...ENV, ELEVENLABS_MODEL_ID: "eleven_flash_v2_5" })
    const { audio } = await services.voice("Hook.\n\nStory.")

    expect([...audio]).toEqual([...MP3])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain("/text-to-speech/JBFqnCBsd6RMkjVDRZzb")
    expect(JSON.parse(init.body as string)).toEqual({ text: "Hook.\n\nStory.", model_id: "eleven_flash_v2_5" })
  })

  it("has no voice to use when ELEVENLABS_VOICE_ID is missing (the handler refuses to start first)", async () => {
    const services = createPipelineServices({ ...ENV, ELEVENLABS_VOICE_ID: undefined })
    await expect(services.voice("Hook.")).rejects.toThrow(/voice/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
