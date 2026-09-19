import type { SourceArticle } from "./types.js"

const PLACEHOLDER_TITLES = new Set(["[removed]", "removed", "[deleted]"])
const MIN_TITLE_LENGTH = 10
const FUTURE_TOLERANCE_MS = 60 * 60 * 1000

/**
 * Cheap deterministic validity checks, deliberately about well-formedness rather
 * than interestingness. Returns why an article is unusable, or null if it is fine.
 */
export function invalidReason(article: SourceArticle, window: { from: Date; to: Date }): string | null {
  if (article.title.length < MIN_TITLE_LENGTH) return "title too short"
  if (PLACEHOLDER_TITLES.has(article.title.toLowerCase())) return "placeholder title"
  if (!article.source) return "missing source"

  const published = new Date(article.publishedAt).getTime()
  if (Number.isNaN(published)) return "unparseable publish date"
  if (published < window.from.getTime()) return "older than the time window"
  if (published > window.to.getTime() + FUTURE_TOLERANCE_MS) return "publish date in the future"

  return null
}
