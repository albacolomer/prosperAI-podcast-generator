import { useCallback, useEffect, useState } from "react"
import { STORAGE_KEYS } from "@/lib/constants"
import { fetchStoredEpisodes } from "@/lib/episodeApi"
import { mergeEpisodes, sortByNewest, toEpisode } from "@/lib/episodeHistory"
import { readStorage, writeStorage } from "@/lib/storage"
import type { Episode, GeneratedEpisode } from "@/types"

const EPISODE_POLL_MS = 30_000

/**
 * The podcasts, newest first. The generated ones live on the server (audio and details), so they are still here after a
 * restart, in another browser or after clearing site data. This browser keeps a copy for the first paint and for when the
 * server cannot be reached.
 */
export function useEpisodes() {
  const [generatedEpisodes, setGeneratedEpisodes] = useState<Episode[]>(() =>
    // Episodes saved before generation was real have no audio to play, so they are not kept.
    sortByNewest(readStorage<Episode[]>(STORAGE_KEYS.generatedEpisodes, []).filter((episode) => episode.audioUrl)),
  )

  /** Asks the server for its list again and adds whatever is new. Episodes the schedule generated while nobody was looking arrive this way. */
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const stored = await fetchStoredEpisodes(signal)
      if (!signal?.aborted) setGeneratedEpisodes((current) => mergeEpisodes(current, stored))
    } catch {
      // The server list is unavailable (offline, API not running): what this browser remembers stays on screen.
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const load = () => void refresh(controller.signal)
    load()
    // A cheap read of the server's list, only while the page is on screen: a scheduled episode shows up without a reload.
    const timer = setInterval(() => document.visibilityState === "visible" && load(), EPISODE_POLL_MS)
    document.addEventListener("visibilitychange", load)
    return () => {
      controller.abort()
      clearInterval(timer)
      document.removeEventListener("visibilitychange", load)
    }
  }, [refresh])

  useEffect(() => writeStorage(STORAGE_KEYS.generatedEpisodes, generatedEpisodes), [generatedEpisodes])

  // Real podcasts only: nothing mocked is ever mixed in here (the onboarding demo has its own isolated state).
  const episodes = generatedEpisodes

  /** Adds a podcast the server just generated and stored; it is already in the server's list, so it also survives a reload. */
  const addGeneratedEpisode = useCallback((generated: GeneratedEpisode) => {
    setGeneratedEpisodes((current) => mergeEpisodes(current, [generated]))
    return toEpisode(generated)
  }, [])

  return { episodes, addGeneratedEpisode, refresh }
}
