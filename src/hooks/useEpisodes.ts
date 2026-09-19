import { useCallback, useState } from "react"
import { mockEpisodes } from "@/data/mockEpisodes"
import { sourcePool } from "@/data/mockSources"
import { gradientForTopic } from "@/data/topicGradients"
import { STORAGE_KEYS } from "@/lib/constants"
import { readStorage, writeStorage } from "@/lib/storage"
import type { Episode, Interest, PodcastSettings } from "@/types"

function pickRandom<T>(items: readonly T[], count: number): T[] {
  const pool = [...items]
  const picked: T[] = []
  while (pool.length > 0 && picked.length < count) {
    const index = Math.floor(Math.random() * pool.length)
    picked.push(pool.splice(index, 1)[0])
  }
  return picked
}

function buildGeneratedEpisode(interests: Interest[], settings: PodcastSettings): Episode {
  const topics =
    interests.length > 0
      ? pickRandom(
          interests.map((interest) => interest.label),
          Math.min(2, interests.length),
        )
      : ["your interests"]
  const dateLabel = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })

  return {
    id: `ep-generated-${Date.now()}`,
    title: `Your ${dateLabel} briefing: ${topics.join(" & ")}`,
    publishedAt: new Date().toISOString(),
    durationSeconds: settings.durationMinutes * 60,
    summary: `A fresh look at ${topics.join(", ")}, curated from today's top stories.`,
    description: `Generated just now from your interests — covering the latest on ${topics.join(", ")}, narrated in your chosen voice and at your chosen length.`,
    topics,
    sources: pickRandom(sourcePool, 2).map((name) => ({ name })),
    coverGradient: gradientForTopic(topics[0]),
  }
}

function sortByNewest(episodes: Episode[]): Episode[] {
  return [...episodes].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
}

export function useEpisodes() {
  const [generatedEpisodes, setGeneratedEpisodes] = useState<Episode[]>(() =>
    readStorage<Episode[]>(STORAGE_KEYS.generatedEpisodes, []),
  )

  const episodes = sortByNewest([...generatedEpisodes, ...mockEpisodes])

  const generateEpisode = useCallback((interests: Interest[], settings: PodcastSettings) => {
    const episode = buildGeneratedEpisode(interests, settings)
    setGeneratedEpisodes((prev) => {
      const next = [episode, ...prev]
      writeStorage(STORAGE_KEYS.generatedEpisodes, next)
      return next
    })
    return episode
  }, [])

  return { episodes, generateEpisode }
}
