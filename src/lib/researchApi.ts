import type { Article, ResearchResponse } from "@/types"

function isResearchResponse(body: unknown): body is ResearchResponse {
  return typeof body === "object" && body !== null && "stories" in body && "stats" in body
}

/** Researches the given articles. The debug flag asks for the per-story trace the debug view shows. */
export async function researchArticles({
  articles,
  signal,
}: {
  articles: Article[]
  signal?: AbortSignal
}): Promise<ResearchResponse> {
  const response = await fetch("/api/research-news", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ articles, debug: true }),
    signal,
  })
  const body: unknown = await response.json().catch(() => null)

  if (response.ok && isResearchResponse(body)) return body
  const message = (body as { error?: string } | null)?.error
  throw new Error(message ?? `Research request failed (${response.status})`)
}
