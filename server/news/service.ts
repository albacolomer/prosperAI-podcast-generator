import type { Article, NewsError, NewsResponse, RemovedArticle } from "../../src/types/article.js"
import { TtlCache } from "./cache.js"
import { dedupeArticles } from "./dedupe.js"
import { invalidReason } from "./filter.js"
import { devLog } from "./log.js"
import type { NewsLogger } from "./log.js"
import { articleIdFromUrl, canonicalizeUrl } from "./normalize.js"
import { NewsProviderError } from "./types.js"
import type { NewsProvider, SearchResult } from "./types.js"

const DEFAULT_LANGUAGE = "en"
const DEFAULT_WINDOW_DAYS = 3
const CACHE_TTL_MS = 30 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

export interface FetchNewsOptions {
  interests: string[]
  language?: string
  days?: number
  /** Also return every article the pipeline removed, with the reason. */
  includeRemoved?: boolean
}

interface TimeWindow {
  from: Date
  to: Date
  days: number
}

interface NewsServiceConfig {
  providers: NewsProvider[]
  now?: () => Date
  log?: NewsLogger
}

function byNewest(a: { publishedAt: string }, b: { publishedAt: string }): number {
  return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
}

function describeError(error: unknown): string {
  if (error instanceof NewsProviderError) return error.message
  console.error("Unexpected news provider failure", error)
  return "unexpected error"
}

/**
 * interests -> providers -> normalize -> filter -> dedupe -> candidate articles.
 * Deliberately stops before any ranking, and only removes articles that are
 * malformed or duplicated: deciding what is interesting is the next stage's job.
 */
export function createNewsService({ providers, now = () => new Date(), log = devLog }: NewsServiceConfig) {
  const cache = new TtlCache<SearchResult>(CACHE_TTL_MS)

  async function searchProvider(provider: NewsProvider, interest: string, language: string, window: TimeWindow) {
    const key = [provider.name, interest.toLowerCase(), language, window.days].join("|")
    const cached = cache.get(key)
    if (cached) return { result: cached, fromCache: true }

    const result = await provider.searchArticles({ query: interest, from: window.from, to: window.to, language })
    cache.set(key, result)
    return { result, fromCache: false }
  }

  async function collectForInterest(interest: string, language: string, window: TimeWindow) {
    const settled = await Promise.allSettled(
      providers.map((provider) => searchProvider(provider, interest, language, window)),
    )

    const errors: NewsError[] = []
    const candidates: Article[] = []
    const invalid: RemovedArticle[] = []
    let raw = 0
    let malformed = 0
    let fromCache = true
    let succeeded = 0

    for (const outcome of settled) {
      if (outcome.status === "rejected") {
        errors.push({ interest, message: describeError(outcome.reason) })
        continue
      }
      const { result, fromCache: cached } = outcome.value
      fromCache &&= cached
      succeeded += 1
      malformed += result.skippedInvalid
      raw += result.articles.length + result.skippedInvalid

      for (const article of result.articles) {
        const canonicalUrl = canonicalizeUrl(article.url)
        const reason = canonicalUrl ? invalidReason(article, window) : "invalid URL"
        if (!canonicalUrl || reason) {
          invalid.push({
            title: article.title,
            source: article.source,
            url: article.url,
            interest,
            reason: "invalid",
            detail: reason ?? "invalid URL",
          })
          continue
        }
        candidates.push({ ...article, id: articleIdFromUrl(canonicalUrl), interests: [interest] })
      }
    }

    log(`"${interest}": ${raw} raw (${malformed} malformed, ${invalid.length} invalid), ${succeeded === 0 ? "failed" : fromCache ? "cached" : "live"}`)
    return { candidates, invalid, errors, raw, malformed }
  }

  async function fetchCandidateArticles({
    interests,
    language = DEFAULT_LANGUAGE,
    days = DEFAULT_WINDOW_DAYS,
    includeRemoved = false,
  }: FetchNewsOptions): Promise<NewsResponse> {
    log(`Interests (${interests.length}): ${interests.join(", ")}`)

    const to = now()
    const window = { from: new Date(to.getTime() - days * DAY_MS), to, days }
    // Fired together, but providers own their pacing (e.g. GNews serializes its own requests).
    const perInterest = await Promise.all(
      interests.map((interest) => collectForInterest(interest, language, window)),
    )

    // Newest first, so when duplicates collapse the freshest copy is the one kept.
    const candidates = perInterest.flatMap((result) => result.candidates).sort(byNewest)
    const { kept, removed: duplicates } = dedupeArticles(candidates)

    const invalidRemoved = perInterest.flatMap((result) => result.invalid)
    const malformed = perInterest.reduce((sum, result) => sum + result.malformed, 0)
    const errors = perInterest.flatMap((result) => result.errors)
    const duplicateUrl = duplicates.filter((entry) => entry.reason === "duplicate-url")
    const similarTitle = duplicates.filter((entry) => entry.reason === "similar-title")

    const removed: RemovedArticle[] = [
      ...invalidRemoved,
      ...duplicates.map(({ article, reason, keptInstead }): RemovedArticle => ({
        title: article.title,
        source: article.source,
        url: article.url,
        interest: article.interests.join(", "),
        reason,
        detail: `${reason === "duplicate-url" ? "same URL as" : "similar to"} "${keptInstead.title}" (${keptInstead.source})`,
      })),
    ]

    const stats = {
      interests: interests.length,
      raw: perInterest.reduce((sum, result) => sum + result.raw, 0),
      invalid: malformed + invalidRemoved.length,
      duplicateUrl: duplicateUrl.length,
      similarTitle: similarTitle.length,
      final: kept.length,
    }

    log(`Raw articles: ${stats.raw}`)
    log(`Invalid articles removed: ${stats.invalid} (${malformed} malformed items skipped by the provider)`)
    for (const entry of invalidRemoved) log(`Removed invalid: "${entry.title}" — ${entry.detail} [${entry.interest}]`)
    log(`Duplicate URLs removed: ${stats.duplicateUrl}`)
    for (const entry of removed.filter((r) => r.reason === "duplicate-url")) {
      log(`Removed duplicate URL: "${entry.title}" (${entry.source}) — ${entry.detail}`)
    }
    log(`Similar titles removed: ${stats.similarTitle}`)
    for (const entry of removed.filter((r) => r.reason === "similar-title")) {
      log(`Removed similar title: "${entry.title}" (${entry.source}) — ${entry.detail}`)
    }
    for (const error of errors) log(`Error for "${error.interest}": ${error.message}`)
    log(`Final articles: ${stats.final}`)

    return { articles: kept, errors, stats, ...(includeRemoved ? { removed } : {}) }
  }

  return { fetchCandidateArticles }
}
