import { useCallback, useEffect, useRef, useState } from "react"
import { fetchNews } from "@/lib/newsApi"
import type { NewsResponse } from "@/types"

export type NewsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: NewsResponse; durationMs: number }
  | { status: "error"; message: string }

/** Fetches candidate news on demand (never automatically), so the rate-limited API is only hit when asked. */
export function useNews({ debug = false }: { debug?: boolean } = {}) {
  const [state, setState] = useState<NewsState>({ status: "idle" })
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => () => controllerRef.current?.abort(), [])

  const load = useCallback(
    async (interests: string[]) => {
      controllerRef.current?.abort()
      const controller = new AbortController()
      controllerRef.current = controller

      setState({ status: "loading" })
      const startedAt = performance.now()
      try {
        const data = await fetchNews({ interests, debug, signal: controller.signal })
        setState({ status: "success", data, durationMs: performance.now() - startedAt })
      } catch (error) {
        if (controller.signal.aborted) return
        setState({ status: "error", message: error instanceof Error ? error.message : "Unknown error" })
      }
    },
    [debug],
  )

  return { state, load }
}
