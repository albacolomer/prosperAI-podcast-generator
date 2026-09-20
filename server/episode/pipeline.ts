import type { Article, NewsResponse } from "../../src/types/article.js"
import type { EpisodeResult, FailureStage, PipelineStage, ProgressEvent } from "../../src/types/generation.js"
import type { RankingResponse } from "../../src/types/ranking.js"
import type { EnrichedStory, ResearchResponse } from "../../src/types/research.js"
import type { ScriptResponse } from "../../src/types/script.js"
import { storiesForDuration } from "../../src/lib/storyBudget.js"
import { OUTPUT_FORMAT } from "../audio/elevenlabs.js"
import type { NewsLogger } from "../news/log.js"
import type { FetchNewsOptions } from "../news/service.js"
import type { RankStoriesInput } from "../ranking/ranker.js"
import { MAX_CANDIDATES } from "../ranking/request.js"
import { MAX_RESEARCH_STORIES } from "../research/request.js"
import type { EpisodeInput } from "../script/episode.js"
import { parseScriptRequest } from "../script/request.js"
import { EpisodeGenerationError } from "./errors.js"
import { episodeLog } from "./log.js"
import type { EpisodeRequest } from "./request.js"
import { downloadFilename } from "./storage.js"
import type { EpisodeStore } from "./storage.js"

/** Called by the script step at the boundaries between planner, writer and validator, which it cannot see from outside. */
export interface ScriptProgress {
  /** The plan was accepted and the writer is starting. Until this is called, a failure is a planning failure. */
  planned(): void
  /** The writer finished and the validator is starting. */
  written(): void
}

/**
 * The existing stage services, injected. Each one is the same code its own /api endpoint runs (the handler wires them
 * from the same factories), so the pipeline owns the order and the hand-offs and nothing else.
 */
export interface PipelineDeps {
  news: { fetchCandidateArticles(options: FetchNewsOptions): Promise<NewsResponse> }
  rank(input: RankStoriesInput): Promise<RankingResponse>
  research(articles: Article[]): Promise<ResearchResponse>
  script(input: EpisodeInput, progress: ScriptProgress): Promise<ScriptResponse>
  voice(script: string): Promise<{ audio: Uint8Array; durationMs: number }>
  store: EpisodeStore
  onProgress?: (event: ProgressEvent) => void
  signal?: AbortSignal
  log?: NewsLogger
  clock?: () => number
}

const AUDIO_BITRATE_BPS = Number(/_(\d+)$/.exec(OUTPUT_FORMAT)?.[1] ?? 128) * 1000
// The planner is an LLM whose plan is checked strictly (for example every connection must rest on selected evidence), so a
// plan can be rejected for a reason a second attempt does not repeat. Planning is a small, cheap call: try again.
const MAX_PLANNING_ATTEMPTS = 3
const MAX_SOURCES = 8
const MAX_SUMMARY_CHARS = 160
// At least one researched story is what /api/generate-script needs; fewer stories simply make a shorter episode.
const MIN_ENRICHED_STORIES = 1

/** The MP3 is constant-bitrate (OUTPUT_FORMAT), so its length follows from its size. The player replaces this with the decoded length. */
export function mp3DurationSeconds(bytes: number): number {
  return Math.round((bytes * 8) / AUDIO_BITRATE_BPS)
}

/** Stage errors carry safe messages by design; anything else logs its class name only, never its message. */
function describeCause(error: unknown): string {
  const named = ["RankingError", "ResearchError", "ScriptError", "AudioError"]
  if (error instanceof Error && named.includes(error.name)) return `${error.name}: ${error.message}`
  return error instanceof Error ? error.name : "unknown error"
}

/**
 * interests + language + duration + tone
 *   -> news -> ranking -> research -> plan + write + validate -> ElevenLabs -> stored MP3.
 * Voicing happens only for a script that passed validation, including the AI evidence review. Any failure is
 * reported as the stage that failed (EpisodeGenerationError), never repaired or retried here.
 */
export async function generateFullEpisode(request: EpisodeRequest, deps: PipelineDeps): Promise<EpisodeResult> {
  const { news, rank, research, script, voice, store, onProgress, signal, log = episodeLog, clock = () => performance.now() } = deps
  const { interests, language, durationMinutes, tone } = request
  const startedAt = clock()

  const emitted = new Set<string>()
  const emit = (stage: PipelineStage, status: ProgressEvent["status"]) => {
    const key = `${stage}:${status}`
    if (emitted.has(key)) return
    emitted.add(key)
    onProgress?.({ stage, status })
  }
  /** Runs one stage: cancellation is checked first, and any failure becomes that stage's own error. */
  async function stage<T>(name: FailureStage, run: () => Promise<T>): Promise<T> {
    if (signal?.aborted) throw new EpisodeGenerationError("cancelled")
    try {
      return await run()
    } catch (error) {
      if (error instanceof EpisodeGenerationError) throw error
      log(`Stage "${name}" failed: ${describeCause(error)}`)
      throw new EpisodeGenerationError(name)
    }
  }
  const timed = async <T>(run: () => Promise<T>): Promise<{ value: T; ms: number }> => {
    const from = clock()
    const value = await run()
    return { value, ms: clock() - from }
  }

  // 1. News
  emit("news", "started")
  const found = await stage("news", () => timed(() => news.fetchCandidateArticles({ interests })))
  // Newest first already; the ranking endpoint accepts at most MAX_CANDIDATES.
  const candidates = found.value.articles.slice(0, MAX_CANDIDATES)
  if (candidates.length === 0) {
    log(`Stage "news" found no articles (${found.value.errors.length} lookup errors)`)
    throw new EpisodeGenerationError("news")
  }
  emit("news", "done")
  log(`News: ${candidates.length} candidate articles`)

  // 2. Ranking
  emit("ranking", "started")
  const ranked = await stage("ranking", () =>
    timed(() => rank({ interests, articles: candidates, maxStories: storiesForDuration(durationMinutes) })),
  )
  const byArticleId = new Map(candidates.map((article) => [article.id, article]))
  const rankedArticles = ranked.value.selected.flatMap(({ articleId, rank: position }) => {
    const article = byArticleId.get(articleId)
    return article ? [{ article, rank: position }] : []
  })
  if (rankedArticles.length === 0) throw new EpisodeGenerationError("ranking")
  emit("ranking", "done")
  log(`Ranking: ${rankedArticles.length} stories selected`)

  // 3. Research
  emit("research", "started")
  const researched = await stage("research", () =>
    timed(() => research(rankedArticles.slice(0, MAX_RESEARCH_STORIES).map(({ article }) => article))),
  )
  const researchById = new Map(researched.value.stories.map((story) => [story.storyId, story]))
  // Research is the only source of facts: only stories it marked enriched can be scripted, in ranking order.
  const enriched: { rank: number; story: EnrichedStory }[] = []
  for (const { article, rank: position } of rankedArticles) {
    const story = researchById.get(article.id)
    if (story?.status === "enriched") {
      const withoutTrace: EnrichedStory = { ...story }
      delete withoutTrace.trace
      enriched.push({ rank: position, story: withoutTrace })
    }
  }
  if (enriched.length < MIN_ENRICHED_STORIES) {
    log(`Stage "research": ${enriched.length} of ${rankedArticles.length} stories enriched`)
    throw new EpisodeGenerationError("research")
  }
  emit("research", "done")
  log(`Research: ${enriched.length} of ${rankedArticles.length} stories enriched`)

  // 4. Plan -> write -> validate. Same request the script endpoint would validate, so it applies the same rules.
  const scriptRequest = parseScriptRequest({ interests, language, durationMinutes, tone, stories: enriched })
  if (!scriptRequest.ok) {
    log(`Stage "script": the researched stories were not accepted (${scriptRequest.message})`)
    throw new EpisodeGenerationError("script")
  }
  emit("planning", "started")
  const scripted = await stage("script", () =>
    timed(async () => {
      for (let attempt = 1; ; attempt++) {
        let planAccepted = false
        try {
          return await script(scriptRequest.request, {
            planned: () => {
              planAccepted = true
              emit("planning", "done")
              emit("writing", "started")
            },
            written: () => {
              emit("writing", "done")
              emit("checking", "started")
            },
          })
        } catch (error) {
          // Only a failure before the writer started is a planning failure: nothing expensive was spent, so plan again.
          // Once the writer has begun, a failure is not retried here (it would repeat the writing and the review too).
          if (planAccepted || attempt >= MAX_PLANNING_ATTEMPTS || signal?.aborted) throw error
          log(`Planning attempt ${attempt} of ${MAX_PLANNING_ATTEMPTS} failed (${describeCause(error)}); planning again`)
        }
      }
    }),
  )
  const episodeScript = scripted.value
  // A script that passed every check but never got its AI evidence review has not been validated reliably either.
  const { validation } = episodeScript
  if (!validation.passed || validation.stats.aiReview === "unavailable") {
    log(`Stage "validation": ${validation.stats.errors} errors, AI review ${validation.stats.aiReview}`)
    throw new EpisodeGenerationError("validation")
  }
  emit("planning", "done")
  emit("writing", "done")
  emit("checking", "done")
  log(`Script: ${episodeScript.stats.wordCount} words, validation passed (${validation.stats.warnings} warnings)`)

  // 5. Voice, then keep the exact MP3 so playback and download both serve it without another ElevenLabs call.
  emit("audio", "started")
  const voiced = await stage("audio", () => timed(() => voice(episodeScript.script)))
  const { id } = await stage("storage", () => store.save({ audio: voiced.value.audio, title: episodeScript.title }))
  emit("audio", "done")
  log(`Audio: ${(voiced.value.audio.length / 1024).toFixed(0)} KB stored as ${id}`)

  const covered = new Set(episodeScript.segments.flatMap((segment) => segment.articleIds))
  const coveredStories = enriched.filter(({ story }) => covered.has(story.storyId)).map(({ story }) => story)
  const sources = new Map<string, { name: string; url?: string }>()
  for (const story of coveredStories) {
    for (const source of story.sources) {
      if (!sources.has(source.domain)) sources.set(source.domain, { name: source.domain, url: source.url })
    }
  }

  // The plan's angle is editorial direction for the writer, not listener-facing text, so the card is described by what it covers.
  const description = `In this episode: ${coveredStories.map((story) => story.headline).join("; ")}.`
  const summary = description.length > MAX_SUMMARY_CHARS ? `${description.slice(0, MAX_SUMMARY_CHARS - 1).trimEnd()}…` : description

  const totalMs = clock() - startedAt
  return {
    episode: {
      id,
      title: episodeScript.title,
      summary,
      description,
      topics: interests,
      sources: [...sources.values()].slice(0, MAX_SOURCES),
      durationSeconds: mp3DurationSeconds(voiced.value.audio.length),
      audioUrl: `/api/episode-audio?id=${id}`,
      downloadUrl: `/api/episode-audio?id=${id}&download=1`,
      downloadFilename: downloadFilename(id),
    },
    stats: {
      newsCandidates: candidates.length,
      rankedStories: rankedArticles.length,
      researchedStories: enriched.length,
      plannedStories: episodeScript.plan.stories.length,
      coveredStories: episodeScript.stats.storiesCovered,
      wordCount: episodeScript.stats.wordCount,
      validation: {
        passed: validation.passed,
        errors: validation.stats.errors,
        warnings: validation.stats.warnings,
        aiReview: validation.stats.aiReview,
      },
      audioBytes: voiced.value.audio.length,
      timingsMs: {
        news: Math.round(found.ms),
        ranking: Math.round(ranked.ms),
        research: Math.round(researched.ms),
        script: Math.round(scripted.ms),
        audio: Math.round(voiced.ms),
        total: Math.round(totalMs),
      },
    },
  }
}
