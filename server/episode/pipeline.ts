import type { Article, NewsResponse } from "../../src/types/article.js"
import type { EpisodeResult, FailureStage, PipelineStage, ProgressEvent } from "../../src/types/generation.js"
import type { RankingResponse } from "../../src/types/ranking.js"
import type { EnrichedStory, ResearchResponse } from "../../src/types/research.js"
import type { ScriptResponse } from "../../src/types/script.js"
import type { ValidationIssue } from "../../src/types/validation.js"
import { storiesForDuration } from "../../src/lib/storyBudget.js"
import type { NewsLogger } from "../news/log.js"
import type { FetchNewsOptions } from "../news/service.js"
import type { RankStoriesInput } from "../ranking/ranker.js"
import { MAX_CANDIDATES } from "../ranking/request.js"
import { MAX_RESEARCH_STORIES } from "../research/request.js"
import type { EpisodeInput, ScriptRetry } from "../script/episode.js"
import { parseScriptRequest } from "../script/request.js"
import { EpisodeGenerationError } from "./errors.js"
import { episodeLog } from "./log.js"
import { mp3DurationSeconds } from "./mp3.js"
import type { EpisodeRequest } from "./request.js"
import { episodeLinks, FAILED_SCRIPTS_DIR } from "./storage.js"
import type { EpisodeStore, StoredEpisode } from "./storage.js"

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
  /** Plans, writes and validates. With `retry`, it skips planning and writes again on that plan (see ScriptRetry). */
  script(input: EpisodeInput, progress: ScriptProgress, retry?: ScriptRetry): Promise<ScriptResponse>
  voice(script: string): Promise<{ audio: Uint8Array; durationMs: number }>
  store: EpisodeStore
  onProgress?: (event: ProgressEvent) => void
  signal?: AbortSignal
  log?: NewsLogger
  clock?: () => number
}

// The planner is an LLM whose plan is checked strictly (for example every connection must rest on selected evidence), so a
// plan can be rejected for a reason a second attempt does not repeat. Planning is a small, cheap call: try again.
const MAX_PLANNING_ATTEMPTS = 3
// The writer is an LLM too, and a script with blocking validation issues can come out clean the second time. Never a third.
const MAX_SCRIPT_ATTEMPTS = 2
const MAX_SOURCES = 8
const MAX_SUMMARY_CHARS = 160
// At least one researched story is what /api/generate-script needs; fewer stories simply make a shorter episode.
const MIN_ENRICHED_STORIES = 1

export { mp3DurationSeconds }

/** Stage errors carry safe messages by design; anything else logs its class name only, never its message. */
function describeCause(error: unknown): string {
  const named = ["RankingError", "ResearchError", "ScriptError", "AudioError"]
  if (error instanceof Error && named.includes(error.name)) return `${error.name}: ${error.message}`
  return error instanceof Error ? error.name : "unknown error"
}

const MAX_LOGGED_ISSUE_CHARS = 300

/** One validation issue as a log line: where it came from, what kind it is, and the script text it is about. */
function describeIssue({ source, type, message, segmentIndex, excerpt }: ValidationIssue): string {
  const shorten = (text: string) => (text.length > MAX_LOGGED_ISSUE_CHARS ? `${text.slice(0, MAX_LOGGED_ISSUE_CHARS - 1)}…` : text)
  const where = segmentIndex === undefined ? "" : ` (segment ${segmentIndex})`
  return `[${source}] ${type}${where}: ${shorten(message)}${excerpt ? ` — "${shorten(excerpt)}"` : ""}`
}

/**
 * interests + language + duration + tone
 *   -> news -> ranking -> research -> plan + write + validate -> ElevenLabs -> stored MP3.
 * Voicing happens only for a script that passed validation, including the AI evidence review. A script with blocking
 * validation issues is written once more (at most MAX_SCRIPT_ATTEMPTS writing attempts, each followed by one validation,
 * on the same plan). Any failure is reported as the stage that failed (EpisodeGenerationError), never repaired here.
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
  // Shared by both attempts. `emit` ignores a stage event it has already sent, so the second attempt adds nothing to the stream.
  const progress: ScriptProgress = {
    planned: () => {
      emit("planning", "done")
      emit("writing", "started")
    },
    written: () => {
      emit("writing", "done")
      emit("checking", "started")
    },
  }
  // A script that passed every check but never got its AI evidence review has not been validated reliably either.
  const isAccepted = ({ validation }: ScriptResponse) => validation.passed && validation.stats.aiReview !== "unavailable"

  const logAttempt = (attempt: number, { validation }: ScriptResponse) => {
    const { passed, stats } = validation
    log(
      `Script attempt ${attempt} of ${MAX_SCRIPT_ATTEMPTS}: validation ${passed ? "PASSED" : "FAILED"} (${stats.errors} errors, ${stats.warnings} warnings, AI review ${stats.aiReview}, ${stats.wordCount} words, max ${stats.maxWords})`,
    )
    // The counts alone do not say why a script was refused. Only the blocking issues are listed, and they carry no keys.
    for (const issue of validation.issues.filter(({ severity }) => severity === "error")) log(`  ${describeIssue(issue)}`)
  }
  /** Debug artifact only: it must never turn a failed script into a different failure, so a write error is just logged. */
  const keepFailedAttempt = async (attempt: number, failed: ScriptResponse, feedback: readonly ValidationIssue[]) => {
    try {
      const name = await store.saveFailedScript({ attempt, maxAttempts: MAX_SCRIPT_ATTEMPTS, feedback, script: failed })
      log(`Script attempt ${attempt} saved for inspection as ${FAILED_SCRIPTS_DIR}/${name}`)
    } catch (error) {
      log(`Could not save script attempt ${attempt} for inspection (${describeCause(error)})`)
    }
  }

  const scripted = await stage("script", () =>
    timed(async () => {
      log(`Script attempt 1 of ${MAX_SCRIPT_ATTEMPTS}`)
      const first = await (async () => {
        for (let attempt = 1; ; attempt++) {
          let planAccepted = false
          try {
            return await script(scriptRequest.request, {
              planned: () => {
                planAccepted = true
                progress.planned()
              },
              written: progress.written,
            })
          } catch (error) {
            // Only a failure before the writer started is a planning failure: nothing expensive was spent, so plan again.
            // Once the writer has begun, a failure is not retried here (it would repeat the writing and the review too).
            if (planAccepted || attempt >= MAX_PLANNING_ATTEMPTS || signal?.aborted) throw error
            log(`Planning attempt ${attempt} of ${MAX_PLANNING_ATTEMPTS} failed (${describeCause(error)}); planning again`)
          }
        }
      })()
      logAttempt(1, first)
      if (!isAccepted(first)) await keepFailedAttempt(1, first, [])
      // A script with blocking issues gets one more writing attempt. A script that only lacks its AI review does not: writing
      // it again would not bring the review back.
      if (first.validation.passed) return { episodeScript: first, attempts: 1 }
      if (signal?.aborted) throw new EpisodeGenerationError("cancelled")

      // Same research, same plan and same settings; nothing upstream runs again. The writer is told what was rejected.
      const feedback = first.validation.issues.filter(({ severity }) => severity === "error")
      log(`Script attempt 1 failed validation; retrying writer`)
      log(`Script attempt 2 of ${MAX_SCRIPT_ATTEMPTS}`)
      const second = await script(scriptRequest.request, progress, { plan: first.plan, issues: feedback })
      logAttempt(2, second)
      if (!isAccepted(second)) await keepFailedAttempt(2, second, feedback)
      return { episodeScript: second, attempts: 2 }
    }),
  )
  const { episodeScript, attempts } = scripted.value
  const { validation } = episodeScript
  if (!isAccepted(episodeScript)) {
    log(`Stage "validation": the script did not pass validation (${attempts} of ${MAX_SCRIPT_ATTEMPTS} attempts used); nothing is voiced`)
    throw new EpisodeGenerationError("validation")
  }
  emit("planning", "done")
  emit("writing", "done")
  emit("checking", "done")
  log(`Script: ${episodeScript.stats.wordCount} words, validation passed on attempt ${attempts} of ${MAX_SCRIPT_ATTEMPTS} (${validation.stats.warnings} warnings)`)

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

  const stored: StoredEpisode = {
    id,
    title: episodeScript.title,
    summary,
    description,
    topics: interests,
    sources: [...sources.values()].slice(0, MAX_SOURCES),
    durationSeconds: mp3DurationSeconds(voiced.value.audio.length),
    publishedAt: new Date().toISOString(),
  }
  // The MP3 is already safe; this record is what lets the podcast list survive a new browser or a cleared cache, so a failure
  // to write it is logged but does not take the finished podcast away from the listener (the browser keeps its own copy too).
  try {
    await store.saveEpisode(stored)
  } catch (error) {
    log(`Could not save the podcast's details next to its audio (${describeCause(error)}); it will not be listed after a reload`)
  }

  const totalMs = clock() - startedAt
  return {
    episode: { ...stored, ...episodeLinks(id) },
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
