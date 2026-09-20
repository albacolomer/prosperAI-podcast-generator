import { useCallback, useEffect, useRef, useState } from "react"
import { EpisodeGenerationFailure, generateEpisode } from "@/lib/episodeApi"
import type { GenerateEpisodeParams } from "@/lib/episodeApi"
import { applyProgress, NO_PROGRESS } from "@/lib/episodeProgress"
import type { StageProgress } from "@/lib/episodeProgress"
import type { EpisodeResult } from "@/types"

export type EpisodeGenerationState =
  | { status: "idle" }
  | { status: "running"; progress: StageProgress }
  | { status: "error"; message: string }

/**
 * Starts the server-side pipeline on demand (never automatically): it spends news, OpenAI, Tavily and ElevenLabs
 * credits. Leaving the page cancels the request, and the server stops at its next stage boundary.
 */
export function useEpisodeGeneration({ onEpisode }: { onEpisode: (result: EpisodeResult) => void }) {
  const [state, setState] = useState<EpisodeGenerationState>({ status: "idle" })
  const controllerRef = useRef<AbortController | null>(null)
  const onEpisodeRef = useRef(onEpisode)
  useEffect(() => {
    onEpisodeRef.current = onEpisode
  })

  useEffect(() => () => controllerRef.current?.abort(), [])

  const start = useCallback(async (params: GenerateEpisodeParams) => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller

    setState({ status: "running", progress: NO_PROGRESS })
    try {
      const result = await generateEpisode({
        ...params,
        signal: controller.signal,
        onProgress: (event) =>
          setState((current) => (current.status === "running" ? { ...current, progress: applyProgress(current.progress, event) } : current)),
      })
      if (controller.signal.aborted) return
      setState({ status: "idle" })
      onEpisodeRef.current(result)
    } catch (error) {
      if (controller.signal.aborted) return
      setState({
        status: "error",
        message:
          error instanceof EpisodeGenerationFailure ? error.message : "Something went wrong while generating the episode. Please try again.",
      })
    }
  }, [])

  const dismissError = useCallback(() => setState((current) => (current.status === "error" ? { status: "idle" } : current)), [])

  return { state, start, dismissError }
}
