import type { Article, EnrichedStory, RankedStory, ScriptResponse, Tone } from "@/types"

export interface ScriptRequestParams {
  interests: string[]
  language: string
  durationMinutes: number
  tone: Tone
  /** Researched stories in ranking order. Only stories Research marked "enriched" are ever sent. */
  stories: { rank: number; story: EnrichedStory }[]
}

/** A ranked story paired with the article it refers to. */
export interface RankedArticle {
  article: Article
  rank: number
  reason: string
}

/** Pairs the ranker's selection with the full articles it refers to, in ranking order. */
export function storiesFromRanking(selected: RankedStory[], articles: Article[]): RankedArticle[] {
  const byId = new Map(articles.map((article) => [article.id, article]))
  return selected.flatMap(({ articleId, rank, reason }) => {
    const article = byId.get(articleId)
    return article ? [{ article, rank, reason }] : []
  })
}

/** What research has produced for one story so far (the shape the research hook keeps per story). */
export type ResearchOutcome =
  | { status: "loading" }
  | { status: "done"; story: EnrichedStory }
  | { status: "error"; message: string }

/** A ranked story the script will not use, and why. */
export interface ExcludedStory {
  articleId: string
  title: string
  reason: string
}

/**
 * The stories a script can be written from: those Research marked "enriched", in ranking order, with their rank
 * and without the debug trace. Everything else comes back as excluded, with the reason, so nothing disappears
 * silently. Research is the only source of facts, so a story that is insufficient, failed or not researched yet
 * is never sent (the server refuses it as well).
 */
export function storiesForScript(
  ranked: RankedArticle[],
  outcomes: Record<string, ResearchOutcome | undefined>,
): { stories: ScriptRequestParams["stories"]; excluded: ExcludedStory[] } {
  const stories: ScriptRequestParams["stories"] = []
  const excluded: ExcludedStory[] = []

  for (const { article, rank } of ranked) {
    const outcome = outcomes[article.id]
    const exclude = (reason: string) => excluded.push({ articleId: article.id, title: article.title, reason })

    if (!outcome || outcome.status === "loading") {
      exclude("not researched yet")
    } else if (outcome.status === "error") {
      exclude(`failed: ${outcome.message}`)
    } else if (outcome.story.status !== "enriched") {
      exclude(`${outcome.story.status}: ${outcome.story.statusReason ?? "no reason given"}`)
    } else {
      const story: EnrichedStory = { ...outcome.story }
      delete story.trace
      stories.push({ rank, story })
    }
  }
  return { stories, excluded }
}

function isScriptResponse(body: unknown): body is ScriptResponse {
  return typeof body === "object" && body !== null && "segments" in body && "script" in body && "stats" in body
}

export async function generateScript({ signal, ...params }: ScriptRequestParams & { signal?: AbortSignal }): Promise<ScriptResponse> {
  const response = await fetch("/api/generate-script", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
    signal,
  })
  const body: unknown = await response.json().catch(() => null)

  if (response.ok && isScriptResponse(body)) return body
  const message = (body as { error?: string } | null)?.error
  throw new Error(message ?? `Script request failed (${response.status})`)
}
