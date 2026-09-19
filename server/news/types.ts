import type { Article } from "../../src/types/article.js"

/** An article as a provider reports it, before it is tied to an interest or given an id. */
export type SourceArticle = Omit<Article, "id" | "interests">

export interface SearchParams {
  query: string
  from?: Date
  to?: Date
  language?: string
}

export interface SearchResult {
  articles: SourceArticle[]
  /** Items the provider returned that were too malformed to become an article. */
  skippedInvalid: number
}

export interface NewsProvider {
  readonly name: string
  searchArticles(params: SearchParams): Promise<SearchResult>
}

/** Thrown by providers for failures worth reporting to the caller (bad key, rate limit, ...). */
export class NewsProviderError extends Error {
  readonly provider: string

  constructor(provider: string, message: string) {
    super(`${provider}: ${message}`)
    this.name = "NewsProviderError"
    this.provider = provider
  }
}
