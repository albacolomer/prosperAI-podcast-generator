import { useCallback, useEffect, useRef, useState } from "react"
import { rankStories } from "@/lib/rankingApi"
import type { Article, RankingResponse } from "@/types"

export type RankingState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "success"
      data: RankingResponse
      /** What the ranking was run against, so the results stay accurate if the inputs change later. */
      request: { interests: string[]; articles: Article[]; maxStories: number }
      durationMs: number
    }
  | { status: "error"; message: string }

/** Ranks candidate articles on demand (never automatically), so OpenAI credits are only spent when asked. */
export function useRanking() {
  const [state, setState] = useState<RankingState>({ status: "idle" })
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => () => controllerRef.current?.abort(), [])

  const rank = useCallback(async (request: { interests: string[]; articles: Article[]; maxStories: number }) => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller

    setState({ status: "loading" })
    const startedAt = performance.now()
    try {
      const data = await rankStories({ ...request, signal: controller.signal })
      setState({ status: "success", data, request, durationMs: performance.now() - startedAt })
    } catch (error) {
      if (controller.signal.aborted) return
      setState({ status: "error", message: error instanceof Error ? error.message : "Unknown error" })
    }
  }, [])

  const reset = useCallback(() => {
    controllerRef.current?.abort()
    setState({ status: "idle" })
  }, [])

  return { state, rank, reset }
}
