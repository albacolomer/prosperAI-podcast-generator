export interface EpisodeSource {
  name: string
  url?: string
}

export interface Episode {
  id: string
  title: string
  publishedAt: string
  durationSeconds: number
  summary: string
  description: string
  topics: string[]
  sources: EpisodeSource[]
  coverGradient: string
}

export type EpisodeFeedback = "up" | "down"
