import type { Article, RemovalReason } from "../../src/types/article.js"
import { canonicalizeUrl, normalizeTitle } from "./normalize.js"

const TITLE_SIMILARITY_THRESHOLD = 0.8

export interface RemovedDuplicate {
  article: Article
  reason: Extract<RemovalReason, "duplicate-url" | "similar-title">
  /** The article that was kept instead. */
  keptInstead: Article
}

function tokenSet(text: string): Set<string> {
  return new Set(text.split(" ").filter((token) => token.length > 2))
}

/** Jaccard similarity of the word sets: 1 = same words, 0 = nothing in common. */
function titleSimilarity(a: string, b: string): number {
  if (a === b) return 1
  const tokensA = tokenSet(a)
  const tokensB = tokenSet(b)
  if (tokensA.size === 0 || tokensB.size === 0) return 0
  let shared = 0
  for (const token of tokensA) if (tokensB.has(token)) shared += 1
  return shared / (tokensA.size + tokensB.size - shared)
}

/**
 * Merges articles that point to the same URL or carry a near-identical title.
 * The first occurrence wins, so callers should order articles by preference
 * (e.g. newest first); interests from later duplicates are folded into the winner.
 */
export function dedupeArticles(articles: Article[]): { kept: Article[]; removed: RemovedDuplicate[] } {
  const seen: { article: Article; url: string; title: string }[] = []
  const removed: RemovedDuplicate[] = []

  for (const article of articles) {
    const url = canonicalizeUrl(article.url) ?? article.url
    const title = normalizeTitle(article.title, article.source)

    const sameUrl = seen.find((entry) => entry.url === url)
    const match = sameUrl ?? seen.find((entry) => titleSimilarity(entry.title, title) >= TITLE_SIMILARITY_THRESHOLD)

    if (!match) {
      seen.push({ article: { ...article, interests: [...article.interests] }, url, title })
      continue
    }
    for (const interest of article.interests) {
      if (!match.article.interests.includes(interest)) match.article.interests.push(interest)
    }
    match.article.imageUrl ??= article.imageUrl
    removed.push({ article, reason: sameUrl ? "duplicate-url" : "similar-title", keptInstead: match.article })
  }

  return { kept: seen.map((entry) => entry.article), removed }
}
