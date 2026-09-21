import { useCallback, useEffect, useRef, useState } from "react"
import { fetchSchedule, saveSchedule } from "@/lib/scheduleApi"
import type { ScheduleSettingsPayload, ScheduleStatus } from "@/types"

/** A scheduled run takes minutes and starts on its own, so the page asks the server how it is going now and then. */
const POLL_MS = 20_000

/**
 * The schedule as the server holds it (it is the server that runs it, so the server is the source of truth): what is on,
 * when the next episode is due and how the latest scheduled run went. `null` until the server has answered, or when it cannot be reached.
 */
export function useSchedule() {
  const [status, setStatus] = useState<ScheduleStatus | null>(null)
  const mounted = useRef(true)

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const next = await fetchSchedule(signal)
      if (mounted.current && !signal?.aborted) setStatus(next)
    } catch {
      // The server cannot be reached (or the API is not running): what is on screen stays.
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    const controller = new AbortController()
    const load = () => void refresh(controller.signal)
    load()
    const timer = setInterval(() => document.visibilityState === "visible" && load(), POLL_MS)
    document.addEventListener("visibilitychange", load)
    return () => {
      mounted.current = false
      controller.abort()
      clearInterval(timer)
      document.removeEventListener("visibilitychange", load)
    }
  }, [refresh])

  /** Saves the schedule on the server. Rejects with a message that is safe to show when it cannot. */
  const save = useCallback(async (payload: ScheduleSettingsPayload) => {
    const saved = await saveSchedule(payload)
    if (mounted.current) setStatus(saved)
    return saved
  }, [])

  return { status, save, refresh }
}
