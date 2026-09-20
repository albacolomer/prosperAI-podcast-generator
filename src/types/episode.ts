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
  /** Set for an episode that has real audio: the stored MP3 played by the Home player. */
  audioUrl?: string
  /** The same stored MP3 as an attachment. */
  downloadUrl?: string
  downloadFilename?: string
}

export type EpisodeFeedback = "up" | "down"
