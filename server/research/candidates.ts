import type { CandidateTrace, ResearchSourceType } from "../../src/types/research.js"
import { canonicalizeUrl, normalizeTitle } from "../news/normalize.js"
import { headlineOverlap } from "./text.js"

/** Social platforms: posts are not reporting, and cannot be checked or attributed like an article. */
const SOCIAL_DOMAINS = [
  "x.com",
  "twitter.com",
  "facebook.com",
  "instagram.com",
  "threads.net",
  "tiktok.com",
  "reddit.com",
  "youtube.com",
  "youtu.be",
  "linkedin.com",
  "pinterest.com",
  "bsky.app",
  "t.me",
  "quora.com",
]
const MIN_SNIPPET_CHARS = 30

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase()
  } catch {
    return ""
  }
}

function isSocialDomain(domain: string): boolean {
  return SOCIAL_DOMAINS.some((social) => domain === social || domain.endsWith(`.${social}`))
}

export interface RawCandidate {
  url: string
  title: string
  /** Tavily's excerpt, or the GNews description for the original article. */
  snippet: string
  score: number | null
  publishedDate?: string
  origin: "original" | "search"
}

export interface Candidate extends RawCandidate {
  /** Local id ("c1", ...) the selection model refers to. */
  id: string
  domain: string
}

interface Entry {
  candidate: Candidate
  state: "available" | "filtered" | "selected"
  reason: string
  sourceType?: ResearchSourceType
  sourceId?: string
}

/**
 * Every result found for one story. Obvious non-candidates are filtered out deterministically on the way in
 * (with the reason kept for debugging); everything else stays available for the selection model.
 */
export class CandidatePool {
  private readonly entries: Entry[] = []
  private readonly urls = new Set<string>()
  private readonly titles = new Set<string>()

  private readonly headline: string

  constructor(headline: string) {
    this.headline = headline
  }

  add(raws: RawCandidate[]): void {
    for (const raw of raws) {
      const candidate: Candidate = { ...raw, id: `c${this.entries.length + 1}`, domain: domainOf(raw.url) }
      const reason = this.rejection(candidate)
      this.entries.push(
        reason
          ? { candidate, state: "filtered", reason }
          : { candidate, state: "available", reason: "not selected" },
      )
    }
  }

  /** Why a candidate is not worth considering, or null. The original article is only checked for well-formedness. */
  private rejection(candidate: Candidate): string | null {
    const key = canonicalizeUrl(candidate.url)
    if (!key) return "malformed URL"
    if (isSocialDomain(candidate.domain)) return "social media"
    const isSearchResult = candidate.origin === "search"
    if (isSearchResult && candidate.snippet.trim().length < MIN_SNIPPET_CHARS) return "no meaningful content"
    if (this.urls.has(key)) return "duplicate URL"
    // The same headline on another domain is a syndicated copy, not independent reporting.
    const title = normalizeTitle(candidate.title, "")
    if (title && this.titles.has(title)) return "duplicate of an already-found article"
    if (isSearchResult && headlineOverlap(this.headline, `${candidate.title} ${candidate.snippet}`) === 0) {
      return "unrelated to the story"
    }
    this.urls.add(key)
    if (title) this.titles.add(title)
    return null
  }

  /** Candidates the selection model may still choose from. */
  available(): Candidate[] {
    return this.entries.filter((entry) => entry.state === "available").map((entry) => entry.candidate)
  }

  get(id: string): Candidate | undefined {
    return this.entries.find((entry) => entry.candidate.id === id)?.candidate
  }

  select(id: string, type: ResearchSourceType, reason: string, sourceId: string): void {
    const entry = this.entries.find((candidate) => candidate.candidate.id === id)
    if (!entry) return
    entry.state = "selected"
    entry.reason = reason
    entry.sourceType = type
    entry.sourceId = sourceId
  }

  /** Takes a candidate out of consideration after the fact, e.g. because its site has used up its attempts. */
  exclude(id: string, reason: string): void {
    const entry = this.entries.find((candidate) => candidate.candidate.id === id)
    if (entry?.state !== "available") return
    entry.state = "filtered"
    entry.reason = reason
  }

  /** Records why the model passed on a candidate. It stays available: a later round may need it. */
  reject(id: string, reason: string): void {
    const entry = this.entries.find((candidate) => candidate.candidate.id === id)
    if (entry?.state === "available") entry.reason = reason
  }

  trace(): CandidateTrace[] {
    return this.entries.map(({ candidate, state, reason, sourceType, sourceId }): CandidateTrace => ({
      url: candidate.url,
      title: candidate.title,
      domain: candidate.domain,
      score: candidate.score,
      origin: candidate.origin,
      outcome: state === "available" ? "not-selected" : state,
      reason,
      ...(sourceType ? { sourceType, sourceId } : {}),
    }))
  }
}
