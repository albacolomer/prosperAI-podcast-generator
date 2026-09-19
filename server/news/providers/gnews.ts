import { z } from "zod"
import { cleanText } from "../normalize.js"
import { NewsProviderError } from "../types.js"
import type { NewsProvider, SearchParams, SearchResult, SourceArticle } from "../types.js"

const GNEWS_SEARCH_URL = "https://gnews.io/api/v4/search"
const MAX_RESULTS_PER_QUERY = 10
const REQUEST_TIMEOUT_MS = 8000
// The free tier rejects requests that arrive close together or concurrently (HTTP 429), so each
// request waits this long after the previous one *finished*.
const MIN_REQUEST_INTERVAL_MS = 1100

const responseSchema = z.object({ articles: z.array(z.unknown()) })

const articleSchema = z.object({
  title: z.string(),
  description: z.string().nullish(),
  url: z.string(),
  image: z.string().nullish(),
  publishedAt: z.string(),
  source: z.object({ name: z.string() }),
})

type FetchLike = (input: string, init?: { signal?: AbortSignal }) => Promise<Response>

interface GNewsProviderOptions {
  fetchImpl?: FetchLike
  minRequestIntervalMs?: number
  /** Injectable so tests can run on a fake clock. */
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** GNews wants ISO 8601 without milliseconds, e.g. 2026-09-19T08:00:00Z. */
function toGNewsDate(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z")
}

function isHttpUrl(value: string | null | undefined): value is string {
  return !!value && /^https?:\/\//i.test(value)
}

export class GNewsProvider implements NewsProvider {
  readonly name = "gnews"
  private readonly apiKey: string
  private readonly fetchImpl: FetchLike
  private readonly minRequestIntervalMs: number
  private readonly sleep: (ms: number) => Promise<void>
  private readonly now: () => number

  // Requests run strictly one after another, with minRequestIntervalMs of quiet after each one.
  private queue: Promise<unknown> = Promise.resolve()
  private lastRequestFinishedAt = Number.NEGATIVE_INFINITY

  constructor(apiKey: string, options: GNewsProviderOptions = {}) {
    this.apiKey = apiKey
    this.fetchImpl = options.fetchImpl ?? fetch
    this.minRequestIntervalMs = options.minRequestIntervalMs ?? MIN_REQUEST_INTERVAL_MS
    this.sleep = options.sleep ?? realSleep
    this.now = options.now ?? Date.now
  }

  async searchArticles({ query, from, to, language }: SearchParams): Promise<SearchResult> {
    const url = new URL(GNEWS_SEARCH_URL)
    // Quoted so "Formula 1" is matched as a phrase rather than as two unrelated words.
    url.searchParams.set("q", `"${query.replaceAll('"', "")}"`)
    url.searchParams.set("max", String(MAX_RESULTS_PER_QUERY))
    url.searchParams.set("apikey", this.apiKey)
    if (language) url.searchParams.set("lang", language)
    if (from) url.searchParams.set("from", toGNewsDate(from))
    if (to) url.searchParams.set("to", toGNewsDate(to))

    const body = await this.throttled(() => this.request(url))
    const envelope = responseSchema.safeParse(body)
    if (!envelope.success) throw new NewsProviderError(this.name, "unexpected response shape")

    const articles = envelope.data.articles.flatMap((raw): SourceArticle[] => {
      const parsed = articleSchema.safeParse(raw)
      if (!parsed.success) return []
      const { title, description, url: articleUrl, image, publishedAt, source } = parsed.data
      return [
        {
          title: cleanText(title),
          description: cleanText(description ?? ""),
          url: articleUrl,
          source: cleanText(source.name),
          imageUrl: isHttpUrl(image) ? image : undefined,
          publishedAt,
        },
      ]
    })
    return { articles, skippedInvalid: envelope.data.articles.length - articles.length }
  }

  /** Queues `task` behind any in-flight request and waits out the minimum interval after the previous one. */
  private throttled<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const wait = this.lastRequestFinishedAt + this.minRequestIntervalMs - this.now()
      if (wait > 0) await this.sleep(wait)
      try {
        return await task()
      } finally {
        this.lastRequestFinishedAt = this.now()
      }
    })
    // A failed request must not block the ones queued behind it.
    this.queue = run.catch(() => undefined)
    return run
  }

  // Errors deliberately never include the request URL: it carries the API key.
  private async request(url: URL): Promise<unknown> {
    let response: Response
    try {
      response = await this.fetchImpl(url.toString(), { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
    } catch {
      throw new NewsProviderError(this.name, "request failed or timed out")
    }

    if (response.status === 401 || response.status === 403) {
      throw new NewsProviderError(this.name, "API key rejected or daily quota exhausted")
    }
    if (response.status === 429) throw new NewsProviderError(this.name, "rate limit exceeded")
    if (!response.ok) throw new NewsProviderError(this.name, `HTTP ${response.status}`)

    try {
      return await response.json()
    } catch {
      throw new NewsProviderError(this.name, "response was not valid JSON")
    }
  }
}
