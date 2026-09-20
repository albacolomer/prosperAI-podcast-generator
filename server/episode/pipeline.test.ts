import { describe, expect, it, vi } from "vitest"
import type { ProgressEvent } from "../../src/types/generation.js"
import type { Article } from "../../src/types/article.js"
import { enrichedStory } from "../script/fixtures.js"
import { EpisodeGenerationError } from "./errors.js"
import { generateFullEpisode, mp3DurationSeconds } from "./pipeline.js"
import { happyDeps, MP3, request, scriptResponse, validation } from "./testKit.js"

async function failure(run: Promise<unknown>): Promise<EpisodeGenerationError> {
  const error = await run.then(
    () => undefined,
    (thrown: unknown) => thrown,
  )
  expect(error).toBeInstanceOf(EpisodeGenerationError)
  return error as EpisodeGenerationError
}

describe("generateFullEpisode", () => {
  it("runs news -> ranking -> research -> script -> voice and returns the stored episode", async () => {
    const deps = happyDeps()
    const { episode, stats } = await generateFullEpisode(request, deps)

    expect(episode).toMatchObject({
      id: "ai-chips-race-cars-your-briefing-0a1b2c3d",
      title: "AI Chips & Race Cars: Your Briefing",
      summary: "In this episode: Headline a; Headline b.",
      description: "In this episode: Headline a; Headline b.",
      topics: request.interests,
      audioUrl: "/api/episode-audio?id=ai-chips-race-cars-your-briefing-0a1b2c3d",
      downloadUrl: "/api/episode-audio?id=ai-chips-race-cars-your-briefing-0a1b2c3d&download=1",
      downloadFilename: "prosperpod-ai-chips-race-cars-your-briefing.mp3",
    })
    expect(episode.sources).toEqual([
      { name: "news.example.com", url: "https://news.example.com/a" },
      { name: "primary.example.org", url: "https://primary.example.org/a" },
    ])
    expect(stats).toMatchObject({ newsCandidates: 4, rankedStories: 2, researchedStories: 2, plannedStories: 2, wordCount: 1400, audioBytes: MP3.length })
    expect(stats.validation).toEqual({ passed: true, errors: 0, warnings: 1, aiReview: "passed" })
  })

  it("summarises long coverage in one short line", async () => {
    const deps = happyDeps({
      research: vi.fn(async (articles: Article[]) => ({
        stories: articles.map(({ id }) => enrichedStory(id, { headline: `A very long headline about ${id} `.repeat(6).trim() })),
        stats: { requested: 2, enriched: 2, insufficient: 0, failed: 0, model: "m", tavilySearches: 0, tavilyExtractions: 0, durationMs: 1 },
      })),
    })
    const { episode } = await generateFullEpisode(request, deps)
    expect(episode.summary.length).toBeLessThanOrEqual(160)
    expect(episode.summary.endsWith("…")).toBe(true)
    expect(episode.description.length).toBeGreaterThan(160)
  })

  it("uses the user's interests, and the duration to size the story budget (10 min -> 7 stories)", async () => {
    const deps = happyDeps()
    await generateFullEpisode({ ...request, durationMinutes: 10 }, deps)
    expect(deps.news.fetchCandidateArticles).toHaveBeenCalledWith({ interests: request.interests })
    expect(deps.rank).toHaveBeenCalledWith(expect.objectContaining({ interests: request.interests, maxStories: 7 }))

    const longer = happyDeps()
    await generateFullEpisode({ ...request, durationMinutes: 30 }, longer)
    expect(longer.rank).toHaveBeenCalledWith(expect.objectContaining({ maxStories: 12 }))
  })

  it("passes language, tone and duration to the script stage together with only the enriched, ranked stories", async () => {
    const deps = happyDeps({
      research: vi.fn(async (articles: Article[]) => ({
        stories: [enrichedStory(articles[0].id), enrichedStory(articles[1].id, { status: "insufficient", statusReason: "thin" })],
        stats: { requested: 2, enriched: 1, insufficient: 1, failed: 0, model: "m", tavilySearches: 0, tavilyExtractions: 0, durationMs: 1 },
      })),
    })
    await generateFullEpisode({ ...request, language: "es", tone: "storytelling", durationMinutes: 15 }, deps)

    const [input] = vi.mocked(deps.script).mock.calls[0]
    expect(input).toMatchObject({ language: "es", tone: "storytelling", durationMinutes: 15, interests: request.interests })
    expect(input.stories.map(({ story }) => story.storyId)).toEqual(["a"])
    expect(input.stories[0].rank).toBe(1)
  })

  it("drops the research trace before the script stage", async () => {
    const deps = happyDeps({
      research: vi.fn(async (articles: Article[]) => ({
        stories: articles.map(({ id }) => ({ ...enrichedStory(id), trace: { queries: [] } as never })),
        stats: { requested: 2, enriched: 2, insufficient: 0, failed: 0, model: "m", tavilySearches: 0, tavilyExtractions: 0, durationMs: 1 },
      })),
    })
    await generateFullEpisode(request, deps)
    expect(vi.mocked(deps.script).mock.calls[0][0].stories.every(({ story }) => !("trace" in story))).toBe(true)
  })

  it("reports each stage as started and done, in order, only when it really happened", async () => {
    const events: ProgressEvent[] = []
    const deps = happyDeps({ onProgress: (event) => events.push(event) })
    await generateFullEpisode(request, deps)

    expect(events.map(({ stage, status }) => `${stage}:${status}`)).toEqual([
      "news:started",
      "news:done",
      "ranking:started",
      "ranking:done",
      "research:started",
      "research:done",
      "planning:started",
      "planning:done",
      "writing:started",
      "writing:done",
      "checking:started",
      "checking:done",
      "audio:started",
      "audio:done",
    ])
  })

  it("does not report a stage as done when it failed", async () => {
    const events: ProgressEvent[] = []
    const deps = happyDeps({ research: vi.fn(async () => Promise.reject(new Error("tavily down"))), onProgress: (event) => events.push(event) })
    await failure(generateFullEpisode(request, deps))
    expect(events).toContainEqual({ stage: "research", status: "started" })
    expect(events).not.toContainEqual({ stage: "research", status: "done" })
    expect(events.some(({ stage }) => stage === "planning" || stage === "audio")).toBe(false)
  })

  it("stores the exact MP3 the voice returned and never calls the voice twice", async () => {
    const deps = happyDeps()
    await generateFullEpisode(request, deps)
    expect(deps.voice).toHaveBeenCalledTimes(1)
    expect(deps.voice).toHaveBeenCalledWith("Welcome. Stories. Bye.")
    expect(deps.store.saved).toEqual([{ audio: MP3, title: "AI Chips & Race Cars: Your Briefing" }])
  })

  describe("failures", () => {
    it("news: no candidate articles", async () => {
      const deps = happyDeps({ news: { fetchCandidateArticles: vi.fn(async () => ({ articles: [], errors: [{ interest: "AI", message: "boom" }], stats: { interests: 1, raw: 0, invalid: 0, duplicateUrl: 0, similarTitle: 0, final: 0 } })) } })
      expect((await failure(generateFullEpisode(request, deps))).stage).toBe("news")
      expect(deps.rank).not.toHaveBeenCalled()
    })

    it("ranking: the ranker fails", async () => {
      const deps = happyDeps({ rank: vi.fn(async () => Promise.reject(new Error("openai"))) })
      expect((await failure(generateFullEpisode(request, deps))).stage).toBe("ranking")
      expect(deps.research).not.toHaveBeenCalled()
    })

    it("research: no story could be researched", async () => {
      const deps = happyDeps({
        research: vi.fn(async (articles: Article[]) => ({
          stories: articles.map(({ id }) => enrichedStory(id, { status: "insufficient" })),
          stats: { requested: 2, enriched: 0, insufficient: 2, failed: 0, model: "m", tavilySearches: 0, tavilyExtractions: 0, durationMs: 1 },
        })),
      })
      const error = await failure(generateFullEpisode(request, deps))
      expect(error.stage).toBe("research")
      expect(error.message).toBe("We couldn't research enough stories to generate this episode.")
      expect(deps.script).not.toHaveBeenCalled()
    })

    it("script: the writer fails, and nothing is voiced", async () => {
      const deps = happyDeps({ script: vi.fn(async () => Promise.reject(new Error("invalid output"))) })
      const error = await failure(generateFullEpisode(request, deps))
      expect(error.stage).toBe("script")
      expect(error.message).toBe("We couldn't generate a reliable script for this episode.")
      expect(deps.voice).not.toHaveBeenCalled()
    })

    it("plans again when the planner's plan is rejected, and still returns the episode", async () => {
      const log = vi.fn()
      let calls = 0
      const deps = happyDeps({
        log,
        script: vi.fn(async (_input, progress) => {
          calls++
          if (calls < 3) throw Object.assign(new Error("The episode planner returned an invalid plan: it grounded a connection in evidence that was not selected"), { name: "ScriptError" })
          progress.planned()
          progress.written()
          return scriptResponse(["a", "b"])
        }),
      })
      const events: ProgressEvent[] = []
      deps.onProgress = (event) => events.push(event)

      const { episode } = await generateFullEpisode(request, deps)

      expect(deps.script).toHaveBeenCalledTimes(3)
      expect(episode.title).toBe("AI Chips & Race Cars: Your Briefing")
      expect(deps.voice).toHaveBeenCalledTimes(1)
      expect(log.mock.calls.flat().join(" ")).toContain("Planning attempt 2 of 3 failed")
      // A rejected plan is never reported as finished planning.
      expect(events.filter(({ stage, status }) => stage === "planning" && status === "done")).toHaveLength(1)
      expect(events.filter(({ stage, status }) => stage === "planning" && status === "started")).toHaveLength(1)
    })

    it("gives up after three rejected plans, without writing or voicing anything", async () => {
      const deps = happyDeps({ script: vi.fn(async () => Promise.reject(new Error("invalid plan"))) })
      const error = await failure(generateFullEpisode(request, deps))
      expect(error.stage).toBe("script")
      expect(deps.script).toHaveBeenCalledTimes(3)
      expect(deps.voice).not.toHaveBeenCalled()
    })

    it("does not plan again once the writer has started: a later failure is not a planning failure", async () => {
      const deps = happyDeps({
        script: vi.fn(async (_input, progress) => {
          progress.planned()
          throw new Error("writer output cut off")
        }),
      })
      expect((await failure(generateFullEpisode(request, deps))).stage).toBe("script")
      expect(deps.script).toHaveBeenCalledTimes(1)
    })

    it("does not plan again once the client is gone", async () => {
      const controller = new AbortController()
      const deps = happyDeps({
        signal: controller.signal,
        script: vi.fn(async () => {
          controller.abort()
          throw new Error("invalid plan")
        }),
      })
      await failure(generateFullEpisode(request, deps))
      expect(deps.script).toHaveBeenCalledTimes(1)
    })

    it("validation: a script that failed validation is never voiced", async () => {
      const deps = happyDeps({
        script: vi.fn(async (_input, progress) => {
          progress.planned()
          progress.written()
          return scriptResponse(["a", "b"], { validation: validation({ passed: false }) })
        }),
      })
      const error = await failure(generateFullEpisode(request, deps))
      expect(error.stage).toBe("validation")
      expect(error.message).toBe("We couldn't validate this episode reliably.")
      // Blocking issues earn one more writing attempt (see scriptRetry.test.ts), and no more.
      expect(deps.script).toHaveBeenCalledTimes(2)
      expect(deps.voice).not.toHaveBeenCalled()
      expect(deps.store.saved).toEqual([])
    })

    it("validation: logs which issues blocked the script (errors only, shortened), so a failed gate can be diagnosed", async () => {
      const failed = validation({ passed: false, wordCount: 1780 })
      failed.issues = [
        { source: "deterministic", type: "word-count-exceeded", severity: "error", message: "The script has 1780 words, over the 1725-word maximum (target 1500)." },
        { source: "ai", type: "unsupported-connection", severity: "error", message: "The outro ties the stories together.", segmentIndex: 4, excerpt: "y".repeat(400) },
        { source: "ai", type: "weak-transition", severity: "warning", message: "A transition is abrupt." },
      ]
      const log = vi.fn()
      const deps = happyDeps({ script: vi.fn(async () => scriptResponse(["a", "b"], { validation: failed })), log })

      await failure(generateFullEpisode(request, deps))

      const lines = log.mock.calls.flat().join("\n")
      expect(lines).toContain("1780 words, max 1725")
      expect(lines).toContain("[deterministic] word-count-exceeded: The script has 1780 words")
      expect(lines).toContain("[ai] unsupported-connection (segment 4): The outro ties the stories together.")
      expect(lines).not.toContain("weak-transition")
      expect(lines).not.toContain("y".repeat(301))
    })

    it("validation: a script whose AI review could not run is not voiced either", async () => {
      const deps = happyDeps({ script: vi.fn(async () => scriptResponse(["a", "b"], { validation: validation({ aiReview: "unavailable" }) })) })
      expect((await failure(generateFullEpisode(request, deps))).stage).toBe("validation")
      expect(deps.voice).not.toHaveBeenCalled()
    })

    it("audio: ElevenLabs fails after a valid script", async () => {
      const deps = happyDeps({ voice: vi.fn(async () => Promise.reject(new Error("xi-secret-key rejected"))) })
      const error = await failure(generateFullEpisode(request, deps))
      expect(error.stage).toBe("audio")
      expect(error.message).toBe("The episode script was generated, but we couldn't generate the audio.")
      expect(error.message).not.toContain("xi-secret-key")
      expect(deps.store.saved).toEqual([])
    })

    it("storage: the MP3 cannot be saved", async () => {
      const deps = happyDeps()
      deps.store.save = vi.fn(async () => Promise.reject(new Error("disk full")))
      expect((await failure(generateFullEpisode(request, deps))).stage).toBe("storage")
    })

    it("stops before the next stage once the client is gone, so no further credits are spent", async () => {
      const controller = new AbortController()
      const deps = happyDeps({
        signal: controller.signal,
        rank: vi.fn(async () => {
          controller.abort()
          return { selected: [{ articleId: "a", rank: 1, reason: "r" }], stats: { candidates: 4, selected: 1, model: "m", durationMs: 1 } }
        }),
      })
      expect((await failure(generateFullEpisode(request, deps))).stage).toBe("cancelled")
      expect(deps.research).not.toHaveBeenCalled()
      expect(deps.voice).not.toHaveBeenCalled()
    })

    it("logs the failing stage without leaking the underlying message of an unknown error", async () => {
      const log = vi.fn()
      const deps = happyDeps({ voice: vi.fn(async () => Promise.reject(new Error("key=xi-secret-key"))), log })
      await failure(generateFullEpisode(request, deps))
      expect(log.mock.calls.flat().join("\n")).not.toContain("xi-secret-key")
    })
  })
})

describe("mp3DurationSeconds", () => {
  it("derives the length of a 128 kbps constant-bitrate MP3 from its size", () => {
    expect(mp3DurationSeconds(16_000)).toBe(1)
    expect(mp3DurationSeconds(8_608_000)).toBe(538)
  })
})
