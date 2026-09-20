import { useCallback, useEffect, useRef, useState } from "react"
import { generateAudio } from "@/lib/audioApi"
import type { AudioRequestParams } from "@/lib/audioApi"

export type AudioState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; url: string; sizeBytes: number; durationMs: number }
  | { status: "error"; message: string }

/** Generates the MP3 on demand (never automatically), so ElevenLabs credits are only spent when asked. */
export function useAudio() {
  const [state, setState] = useState<AudioState>({ status: "idle" })
  const controllerRef = useRef<AbortController | null>(null)
  const urlRef = useRef<string | null>(null)

  const release = useCallback(() => {
    controllerRef.current?.abort()
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = null
  }, [])

  useEffect(() => release, [release])

  const generate = useCallback(
    async (request: AudioRequestParams) => {
      release()
      const controller = new AbortController()
      controllerRef.current = controller

      setState({ status: "loading" })
      const startedAt = performance.now()
      try {
        const blob = await generateAudio({ ...request, signal: controller.signal })
        urlRef.current = URL.createObjectURL(blob)
        setState({ status: "success", url: urlRef.current, sizeBytes: blob.size, durationMs: performance.now() - startedAt })
      } catch (error) {
        if (controller.signal.aborted) return
        setState({ status: "error", message: error instanceof Error ? error.message : "Unknown error" })
      }
    },
    [release],
  )

  return { state, generate }
}
