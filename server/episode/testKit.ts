import { vi } from "vitest"
import type { Article, NewsResponse } from "../../src/types/article.js"
import type { ScriptResponse } from "../../src/types/script.js"
import type { ScriptValidation } from "../../src/types/validation.js"
import { enrichedStory, planOf, segment } from "../script/fixtures.js"
import type { PipelineDeps } from "./pipeline.js"
import type { EpisodeRequest } from "./request.js"
import type { EpisodeStore } from "./storage.js"

export const MP3 = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0xff, 0xfb, 0x90, 0x00])

export const request: EpisodeRequest = {
  interests: ["Artificial Intelligence", "Formula 1"],
  language: "en",
  durationMinutes: 10,
  tone: "conversational",
}

export const article = (id: string): Article => ({
  id,
  title: `Title ${id}`,
  description: `Description of ${id}`,
  url: `https://example.com/${id}`,
  source: "Example",
  publishedAt: "2026-09-18T10:00:00.000Z",
  interests: ["Artificial Intelligence"],
})

const news = (ids: string[]): NewsResponse => ({
  articles: ids.map(article),
  errors: [],
  stats: { interests: 2, raw: ids.length, invalid: 0, duplicateUrl: 0, similarTitle: 0, final: ids.length },
})

export const validation = (overrides: Partial<ScriptValidation["stats"]> & { passed?: boolean } = {}): ScriptValidation => {
  const { passed = true, ...stats } = overrides
  return {
    passed,
    issues: [],
    stats: { wordCount: 1400, targetWords: 1500, maxWords: 1725, minWords: 1125, storiesPlanned: 2, storiesCovered: 2, quotesUsed: 0, errors: passed ? 0 : 1, warnings: 1, aiReview: "passed", ...stats },
  }
}

export function scriptResponse(storyIds: string[], overrides: Partial<ScriptResponse> = {}): ScriptResponse {
  return {
    title: "AI Chips & Race Cars: Your Briefing",
    segments: [segment("hook", "Welcome."), ...storyIds.map((id) => segment("story", `About ${id}.`, [id])), segment("outro", "Bye.")],
    omitted: [],
    script: "Welcome. Stories. Bye.",
    stats: { storiesProvided: storyIds.length, storiesCovered: storyIds.length, storiesOmitted: 0, wordCount: 1400, targetWords: 1500, targetMinutes: 10, estimatedMinutes: 9.3, model: "gpt-5.5", durationMs: 1 },
    plan: planOf(storyIds, { angle: "Two worlds where speed decides the winner." }),
    validation: validation(),
    stages: { planner: { model: "p", durationMs: 1 }, writer: { model: "w", durationMs: 1 }, validator: { model: "v", durationMs: 1 }, totalMs: 3 },
    ...overrides,
  }
}

export const memoryStore = (): EpisodeStore & { saved: { audio: Uint8Array; title: string }[] } => {
  const saved: { audio: Uint8Array; title: string }[] = []
  return {
    saved,
    save: vi.fn(async (input) => {
      saved.push(input)
      return { id: "ai-chips-race-cars-your-briefing-0a1b2c3d" }
    }),
    read: vi.fn(async () => MP3),
  }
}

/** A pipeline whose every stage succeeds with two ranked, researched stories. Override any stage to make it fail. */
export function happyDeps(overrides: Partial<PipelineDeps> = {}): PipelineDeps & { store: ReturnType<typeof memoryStore> } {
  const ids = ["a", "b"]
  return {
    news: { fetchCandidateArticles: vi.fn(async () => news(["a", "b", "c", "d"])) },
    rank: vi.fn(async () => ({
      selected: ids.map((articleId, index) => ({ articleId, rank: index + 1, reason: "relevant" })),
      stats: { candidates: 4, selected: 2, model: "m", durationMs: 1 },
    })),
    research: vi.fn(async (articles: Article[]) => ({
      stories: articles.map(({ id }) => enrichedStory(id)),
      stats: { requested: articles.length, enriched: articles.length, insufficient: 0, failed: 0, model: "m", tavilySearches: 1, tavilyExtractions: 1, durationMs: 1 },
    })),
    script: vi.fn(async (_input, progress) => {
      progress.planned()
      progress.written()
      return scriptResponse(ids)
    }),
    voice: vi.fn(async () => ({ audio: MP3, durationMs: 5 })),
    store: memoryStore(),
    log: () => {},
    ...overrides,
  } as PipelineDeps & { store: ReturnType<typeof memoryStore> }
}
