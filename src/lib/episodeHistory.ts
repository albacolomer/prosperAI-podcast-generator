import { gradientForTopic } from "@/data/topicGradients"
import type { Episode, StoredPodcast } from "@/types"

export function toEpisode(podcast: StoredPodcast): Episode {
  return {
    id: podcast.id,
    title: podcast.title,
    publishedAt: podcast.publishedAt,
    durationSeconds: podcast.durationSeconds,
    summary: podcast.summary,
    description: podcast.description,
    topics: podcast.topics,
    sources: podcast.sources,
    coverGradient: gradientForTopic(podcast.topics[0]),
    audioUrl: podcast.audioUrl,
    downloadUrl: podcast.downloadUrl,
    downloadFilename: podcast.downloadFilename,
  }
}

/** Newest first: the order of every list of podcasts. */
export function sortByNewest(episodes: Episode[]): Episode[] {
  return [...episodes].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
}

/**
 * The podcasts this browser remembers plus the ones the server has stored, one entry per id, newest first. The server's
 * record wins, except when it was rebuilt from the audio file alone (`recovered`): then the browser's copy, which still
 * has the real title and description, is kept. A podcast only the browser knows about is kept too, so nothing already
 * shown disappears because the server list was empty or unreachable.
 */
export function mergeEpisodes(remembered: Episode[], stored: StoredPodcast[]): Episode[] {
  const byId = new Map(remembered.map((episode) => [episode.id, episode]))
  for (const podcast of stored) {
    if (!podcast.recovered || !byId.has(podcast.id)) byId.set(podcast.id, toEpisode(podcast))
  }
  return sortByNewest([...byId.values()])
}
