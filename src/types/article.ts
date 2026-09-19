export interface Article {
  id: string
  title: string
  description: string
  url: string
  source: string
  imageUrl?: string
  publishedAt: string
  /** Every interest this story matched — the same story can surface for several. */
  interests: string[]
}

export interface NewsError {
  interest: string
  message: string
}

/** How the deterministic pipeline treated the raw provider results. */
export interface NewsStats {
  interests: number
  /** Everything the providers returned, including items that could not even be parsed. */
  raw: number
  invalid: number
  duplicateUrl: number
  similarTitle: number
  final: number
}

export type RemovalReason = "invalid" | "duplicate-url" | "similar-title"

/** An article the pipeline dropped, and why. Only returned for debug requests. */
export interface RemovedArticle {
  title: string
  source: string
  url: string
  interest: string
  reason: RemovalReason
  detail: string
}

export interface NewsResponse {
  articles: Article[]
  errors: NewsError[]
  stats: NewsStats
  removed?: RemovedArticle[]
}
