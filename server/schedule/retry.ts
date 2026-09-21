import type { NewsResponse } from "../../src/types/article.js"
import type { ResearchResponse } from "../../src/types/research.js"
import { AudioError } from "../audio/errors.js"
import { EpisodeGenerationError } from "../episode/errors.js"
import type { PipelineServices } from "../episode/services.js"
import { RankingError } from "../ranking/errors.js"
import { ResearchError } from "../research/errors.js"
import { ScriptError } from "../script/errors.js"

/**
 * The pipeline reports a failure as `EpisodeGenerationError(stage)` and, by design, drops what went wrong inside. That is
 * enough for a person but not to tell a network blip from a revoked key, so the scheduler watches the services it hands to
 * the pipeline and remembers the error each one last threw (or what the news lookup complained about). The pipeline itself is untouched.
 */
export interface FailureObservation {
  /** The error the most recent service call threw; cleared as soon as a later call succeeds, so it is never stale. */
  cause?: unknown
  /** Why the news lookup came back empty, when it did. */
  newsErrors: string[]
  /** Stories whose research failed (as opposed to being merely insufficient) in the last research call. */
  researchFailures: number
}

export const newObservation = (): FailureObservation => ({ newsErrors: [], researchFailures: 0 })

/** The same services, unchanged in behaviour, that record what they last failed with. */
export function observeServices(services: PipelineServices, observation: FailureObservation): PipelineServices {
  const watch = <Args extends unknown[], Result>(call: (...args: Args) => Promise<Result>, inspect?: (result: Result) => void) =>
    async (...args: Args): Promise<Result> => {
      try {
        const result = await call(...args)
        observation.cause = undefined
        inspect?.(result)
        return result
      } catch (error) {
        observation.cause = error
        throw error
      }
    }

  return {
    ...services,
    news: {
      fetchCandidateArticles: watch(services.news.fetchCandidateArticles.bind(services.news), (found: NewsResponse) => {
        observation.newsErrors = found.articles.length === 0 ? found.errors.map((error) => error.message) : []
      }),
    },
    rank: watch(services.rank),
    research: watch(services.research, (found: ResearchResponse) => {
      observation.researchFailures = found.stats.failed
    }),
    script: watch(services.script),
    voice: watch(services.voice),
  }
}

// HTTP statuses that a second identical request will not fix: a bad request, a rejected key, a missing model, and 429, which
// OpenAI uses both for "slow down" and for "out of quota" (the two cannot be told apart from the safe message we keep).
const PERMANENT_UPSTREAM = /HTTP (400|401|403|404|422|429)\b|rejected the API key|refused the request|usage limit|quota/i

/** A failure from a provider that a new attempt might well get past: a timeout, a dropped connection, a 5xx, a malformed model answer. */
function isTransientCause(cause: unknown): boolean {
  if (cause instanceof AudioError) {
    switch (cause.kind) {
      case "timeout":
      case "invalid-audio":
        return true
      case "rate-limit":
      case "upstream":
        return !PERMANENT_UPSTREAM.test(cause.message)
      // Not configured, a bad voice or model, a script that cannot be voiced, a rejected key: a retry would fail the same way.
      case "not-configured":
      case "invalid-config":
      case "not-validated":
      case "empty-script":
      case "script-too-long":
      case "auth":
        return false
    }
  }
  if (cause instanceof RankingError || cause instanceof ResearchError || cause instanceof ScriptError) {
    switch (cause.kind) {
      case "timeout":
      case "invalid-output":
        return true
      case "upstream":
        return !PERMANENT_UPSTREAM.test(cause.message)
      case "not-configured":
        return false
    }
  }
  // Anything the pipeline's own services do not describe is not known to be transient, and a retry costs a whole run.
  return false
}

const PERMANENT_NEWS = /API key rejected|quota|HTTP (400|401|403|404|422)\b/i

export interface Verdict {
  /** Worth a second full attempt. */
  retryable: boolean
  /** Safe to show the user: the pipeline's own message for the failed stage. */
  message: string
}

/**
 * Whether a failed attempt is worth repeating. Only plausibly transient failures are: a timeout, a dropped connection, a
 * temporary provider error, or output a model can get right on another go (a script that fails validation, a plan that is
 * rejected). A missing or refused key, an exhausted quota, a bad voice or model setting, or a failure after the audio was
 * paid for and could not be saved is permanent, and so is a cancellation.
 */
export function classifyFailure(error: unknown, observation: FailureObservation): Verdict {
  if (!(error instanceof EpisodeGenerationError)) {
    return { retryable: false, message: "Something unexpected went wrong while generating the episode." }
  }
  const message = error.message
  const { cause } = observation
  switch (error.stage) {
    case "config":
    case "cancelled":
    case "storage":
      return { retryable: false, message }
    case "news":
      return { retryable: cause !== undefined ? isTransientCause(cause) : observation.newsErrors.some((text) => !PERMANENT_NEWS.test(text)), message }
    case "ranking":
    case "audio":
      return { retryable: cause === undefined ? error.stage === "ranking" : isTransientCause(cause), message }
    case "research":
      return { retryable: cause !== undefined ? isTransientCause(cause) : observation.researchFailures > 0, message }
    case "script":
    case "validation":
      // A rejected plan or a script that fails validation is what a model may get right on the next attempt. A provider error is judged as one.
      return { retryable: cause === undefined ? true : isTransientCause(cause), message }
  }
}
