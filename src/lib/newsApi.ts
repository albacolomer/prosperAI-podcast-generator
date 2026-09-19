import type { NewsResponse } from "@/types"

interface FetchNewsParams {
  interests: string[]
  language?: string
  days?: number
  /** Ask the server to also return every removed article and why. */
  debug?: boolean
  signal?: AbortSignal
}

function isNewsResponse(body: unknown): body is NewsResponse {
  return typeof body === "object" && body !== null && "articles" in body && "errors" in body && "stats" in body
}

export async function fetchNews({ interests, language, days, debug, signal }: FetchNewsParams): Promise<NewsResponse> {
  const params = new URLSearchParams({ interests: interests.join(",") })
  if (language) params.set("language", language)
  if (days) params.set("days", String(days))
  if (debug) params.set("debug", "1")

  const response = await fetch(`/api/news?${params}`, { signal })
  const body: unknown = await response.json().catch(() => null)

  // A 502 (every lookup failed) still carries a NewsResponse with per-interest errors, so hand it back.
  if (isNewsResponse(body)) return body
  if (!response.ok) {
    const message = (body as { error?: string } | null)?.error
    throw new Error(message ?? `News request failed (${response.status})`)
  }
  throw new Error("Unexpected response from /api/news — is the API running?")
}
