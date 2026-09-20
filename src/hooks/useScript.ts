import { useCallback, useEffect, useRef, useState } from "react"
import { generateScript } from "@/lib/scriptApi"
import type { ScriptRequestParams } from "@/lib/scriptApi"
import type { ScriptResponse } from "@/types"

export type ScriptState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "success"
      data: ScriptResponse
      /** What the script was generated from, so the results stay accurate if the inputs change later. */
      request: ScriptRequestParams
      durationMs: number
    }
  | { status: "error"; message: string }

/** Generates a script on demand (never automatically), so OpenAI credits are only spent when asked. */
export function useScript() {
  const [state, setState] = useState<ScriptState>({ status: "idle" })
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => () => controllerRef.current?.abort(), [])

  const generate = useCallback(async (request: ScriptRequestParams) => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller

    setState({ status: "loading" })
    const startedAt = performance.now()
    try {
      const data = await generateScript({ ...request, signal: controller.signal })
      setState({ status: "success", data, request, durationMs: performance.now() - startedAt })
    } catch (error) {
      if (controller.signal.aborted) return
      setState({ status: "error", message: error instanceof Error ? error.message : "Unknown error" })
    }
  }, [])

  return { state, generate }
}
