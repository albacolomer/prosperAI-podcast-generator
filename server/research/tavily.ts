import { z } from "zod"
import { ResearchError } from "./errors.js"

const SEARCH_URL = "https://api.tavily.com/search"
const EXTRACT_URL = "https://api.tavily.com/extract"
export const SEARCH_MAX_RESULTS = 8
const SEARCH_TIMEOUT_MS = 20_000
const EXTRACT_TIMEOUT_MS = 50_000
const MAX_ERROR_CHARS = 200

export type SearchTopic = "news" | "general"

export interface TavilySearchParams {
  query: string
  topic: SearchTopic
}

export interface TavilySearchResult {
  title: string
  url: string
  /** Tavily's excerpt of the page, not the full article. */
  content: string
  score: number | null
  publishedDate?: string
}

export interface TavilyExtracted {
  url: string
  content: string
}

export interface TavilyExtractOutcome {
  extracted: TavilyExtracted[]
  failed: { url: string; error: string }[]
}

/** The two Tavily operations research needs. Injectable so tests never touch the network. */
export interface TavilyClient {
  search(params: TavilySearchParams): Promise<TavilySearchResult[]>
  extract(urls: string[]): Promise<TavilyExtractOutcome>
}

const searchResponseSchema = z.object({ results: z.array(z.unknown()) })
const searchResultSchema = z.object({
  title: z.string().nullish(),
  url: z.string(),
  content: z.string().nullish(),
  score: z.number().nullish(),
  published_date: z.string().nullish(),
})

const extractResponseSchema = z.object({
  results: z.array(z.unknown()),
  failed_results: z.array(z.unknown()).nullish(),
})
const extractedSchema = z.object({ url: z.string(), raw_content: z.string().nullish() })
const failedSchema = z.object({ url: z.string(), error: z.string().nullish() })

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

interface TavilyClientConfig {
  apiKey: string
  fetchImpl?: FetchLike
}

/** Calls the Tavily REST API with plain fetch. The key travels only in a header and never appears in errors. */
export function createTavilyClient({ apiKey, fetchImpl = fetch }: TavilyClientConfig): TavilyClient {
  async function post(url: string, body: unknown, timeoutMs: number): Promise<unknown> {
    let response: Response
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new ResearchError("timeout", "The request to Tavily timed out")
      }
      throw new ResearchError("upstream", "The request to Tavily failed")
    }

    if (response.status === 401) throw new ResearchError("upstream", "Tavily rejected the API key")
    if (response.status === 429) throw new ResearchError("upstream", "Tavily rate limit exceeded")
    if (response.status === 432 || response.status === 433) {
      throw new ResearchError("upstream", "Tavily usage limit exceeded")
    }
    if (!response.ok) throw new ResearchError("upstream", `Tavily returned HTTP ${response.status}`)

    try {
      return await response.json()
    } catch {
      throw new ResearchError("upstream", "Tavily returned a response that was not valid JSON")
    }
  }

  return {
    async search({ query, topic }) {
      const body = await post(
        SEARCH_URL,
        {
          query,
          topic,
          search_depth: "basic",
          max_results: SEARCH_MAX_RESULTS,
          // Stories are days old; a general (non-news) search is for older primary sources, so it looks back further.
          time_range: topic === "news" ? "week" : "month",
          include_answer: false,
          include_raw_content: false,
        },
        SEARCH_TIMEOUT_MS,
      )
      const envelope = searchResponseSchema.safeParse(body)
      if (!envelope.success) throw new ResearchError("upstream", "Tavily returned an unexpected search response")

      return envelope.data.results.flatMap((raw): TavilySearchResult[] => {
        const parsed = searchResultSchema.safeParse(raw)
        if (!parsed.success) return []
        const { title, url, content, score, published_date } = parsed.data
        return [
          { title: title ?? "", url, content: content ?? "", score: score ?? null, publishedDate: published_date ?? undefined },
        ]
      })
    },

    async extract(urls) {
      if (urls.length === 0) return { extracted: [], failed: [] }
      const body = await post(
        EXTRACT_URL,
        // Plain text keeps quotes verifiable: markdown would add link syntax inside the sentences.
        { urls, extract_depth: "basic", format: "text", timeout: 30 },
        EXTRACT_TIMEOUT_MS,
      )
      const envelope = extractResponseSchema.safeParse(body)
      if (!envelope.success) throw new ResearchError("upstream", "Tavily returned an unexpected extract response")

      const extracted = envelope.data.results.flatMap((raw): TavilyExtracted[] => {
        const parsed = extractedSchema.safeParse(raw)
        return parsed.success ? [{ url: parsed.data.url, content: parsed.data.raw_content ?? "" }] : []
      })
      const failed = (envelope.data.failed_results ?? []).flatMap((raw) => {
        const parsed = failedSchema.safeParse(raw)
        return parsed.success
          ? [{ url: parsed.data.url, error: (parsed.data.error ?? "extraction failed").slice(0, MAX_ERROR_CHARS) }]
          : []
      })
      return { extracted, failed }
    },
  }
}
