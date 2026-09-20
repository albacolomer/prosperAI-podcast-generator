import { useCallback, useState } from "react"
import { mockEpisodes } from "@/data/mockEpisodes"
import { gradientForTopic } from "@/data/topicGradients"
import { STORAGE_KEYS } from "@/lib/constants"
import { readStorage, writeStorage } from "@/lib/storage"
import type { Episode, GeneratedEpisode } from "@/types"

function toEpisode(generated: GeneratedEpisode): Episode {
  return {
    id: generated.id,
    title: generated.title,
    publishedAt: new Date().toISOString(),
    durationSeconds: generated.durationSeconds,
    summary: generated.summary,
    description: generated.description,
    topics: generated.topics,
    sources: generated.sources,
    coverGradient: gradientForTopic(generated.topics[0]),
    audioUrl: generated.audioUrl,
    downloadUrl: generated.downloadUrl,
    downloadFilename: generated.downloadFilename,
  }
}

function sortByNewest(episodes: Episode[]): Episode[] {
  return [...episodes].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
}

export function useEpisodes() {
  const [generatedEpisodes, setGeneratedEpisodes] = useState<Episode[]>(() =>
    // Episodes saved before generation was real have no audio to play, so they are not kept.
    readStorage<Episode[]>(STORAGE_KEYS.generatedEpisodes, []).filter((episode) => episode.audioUrl),
  )

  const episodes = sortByNewest([...generatedEpisodes, ...mockEpisodes])

  /** Adds an episode the server generated and stored. Only its metadata is kept here; the MP3 stays on the server. */
  const addGeneratedEpisode = useCallback((generated: GeneratedEpisode) => {
    const episode = toEpisode(generated)
    setGeneratedEpisodes((prev) => {
      const next = [episode, ...prev]
      writeStorage(STORAGE_KEYS.generatedEpisodes, next)
      return next
    })
    return episode
  }, [])

  return { episodes, addGeneratedEpisode }
}
