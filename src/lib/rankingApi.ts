import type { Article, RankingResponse } from "@/types"

interface RankStoriesParams {
  interests: string[]
  articles: Article[]
  maxStories: number
  signal?: AbortSignal
}

export { storiesForDuration } from "./storyBudget"

function isRankingResponse(body: unknown): body is RankingResponse {
  return typeof body === "object" && body !== null && "selected" in body && "stats" in body
}

export async function rankStories({ interests, articles, maxStories, signal }: RankStoriesParams): Promise<RankingResponse> {
  const response = await fetch("/api/rank-news", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ interests, articles, maxStories }),
    signal,
  })
  const body: unknown = await response.json().catch(() => null)

  if (response.ok && isRankingResponse(body)) return body
  const message = (body as { error?: string } | null)?.error
  throw new Error(message ?? `Ranking request failed (${response.status})`)
}
