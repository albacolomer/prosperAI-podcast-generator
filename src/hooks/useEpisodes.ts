import { useCallback, useEffect, useState } from "react"
import { mockEpisodes } from "@/data/mockEpisodes"
import { STORAGE_KEYS } from "@/lib/constants"
import { fetchStoredEpisodes } from "@/lib/episodeApi"
import { mergeEpisodes, sortByNewest, toEpisode } from "@/lib/episodeHistory"
import { readStorage, writeStorage } from "@/lib/storage"
import type { Episode, GeneratedEpisode } from "@/types"

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

  useEffect(() => {
    const controller = new AbortController()
    fetchStoredEpisodes(controller.signal)
      .then((stored) => setGeneratedEpisodes((current) => mergeEpisodes(current, stored)))
      .catch(() => {
        // The server list is unavailable (offline, API not running): what this browser remembers stays on screen.
      })
    return () => controller.abort()
  }, [])

  useEffect(() => writeStorage(STORAGE_KEYS.generatedEpisodes, generatedEpisodes), [generatedEpisodes])

  const episodes = sortByNewest([...generatedEpisodes, ...mockEpisodes])

  /** Adds a podcast the server just generated and stored; it is already in the server's list, so it also survives a reload. */
  const addGeneratedEpisode = useCallback((generated: GeneratedEpisode) => {
    setGeneratedEpisodes((current) => mergeEpisodes(current, [generated]))
    return toEpisode(generated)
  }, [])

  return { episodes, addGeneratedEpisode }
}
