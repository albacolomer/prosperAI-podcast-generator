import { useCallback, useEffect, useRef, useState } from "react"
import { researchArticles } from "@/lib/researchApi"
import type { Article, EnrichedStory, ResearchStats } from "@/types"

/** Stories are researched one request each (see below), this many at a time. */
const CONCURRENT_REQUESTS = 3

export type StoryResearchState =
  | { status: "loading" }
  | { status: "done"; story: EnrichedStory; stats: ResearchStats; durationMs: number }
  | { status: "error"; message: string }

export type ResearchState =
  | { status: "idle" }
  | {
      status: "running" | "finished"
      /** The articles being researched, in ranking order. */
      articles: Article[]
      byId: Record<string, StoryResearchState>
      startedAt: number
      durationMs?: number
    }

/**
 * Researches stories on demand (never automatically), so Tavily and OpenAI credits are only spent when asked.
 * Each story is its own request: results appear as they finish, and no single request has to outlast a
 * hosting platform's function timeout.
 */
export function useResearch() {
  const [state, setState] = useState<ResearchState>({ status: "idle" })
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => () => controllerRef.current?.abort(), [])

  const research = useCallback(async (articles: Article[]) => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller

    const startedAt = performance.now()
    setState({
      status: "running",
      articles,
      byId: Object.fromEntries(articles.map((article) => [article.id, { status: "loading" } as StoryResearchState])),
      startedAt,
    })

    const update = (id: string, next: StoryResearchState) => {
      if (controller.signal.aborted) return
      setState((current) => (current.status === "idle" ? current : { ...current, byId: { ...current.byId, [id]: next } }))
    }

    let next = 0
    const worker = async () => {
      while (next < articles.length && !controller.signal.aborted) {
        const article = articles[next++]
        const storyStartedAt = performance.now()
        try {
          const data = await researchArticles({ articles: [article], signal: controller.signal })
          update(article.id, { status: "done", story: data.stories[0], stats: data.stats, durationMs: performance.now() - storyStartedAt })
        } catch (error) {
          if (controller.signal.aborted) return
          update(article.id, { status: "error", message: error instanceof Error ? error.message : "Unknown error" })
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENT_REQUESTS, articles.length) }, worker))

    if (controller.signal.aborted) return
    setState((current) => (current.status === "idle" ? current : { ...current, status: "finished", durationMs: performance.now() - startedAt }))
  }, [])

  return { state, research }
}
