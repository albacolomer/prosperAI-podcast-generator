/** The stages the user watches. Planning, writing and checking are the three steps of script generation. */
export type PipelineStage = "news" | "ranking" | "research" | "planning" | "writing" | "checking" | "audio"

/** Where the pipeline failed. Each one has its own user-facing message (server/episode/errors.ts). */
export type FailureStage = "config" | "news" | "ranking" | "research" | "script" | "validation" | "audio" | "storage" | "cancelled"

export interface ProgressEvent {
  stage: PipelineStage
  status: "started" | "done"
}

export interface GeneratedEpisode {
  id: string
  title: string
  summary: string
  description: string
  topics: string[]
  sources: { name: string; url?: string }[]
  durationSeconds: number
  /** Streams the stored MP3 for playback. */
  audioUrl: string
  /** The same stored MP3 as an attachment named prosperpod-<title>.mp3. Serving it never calls ElevenLabs. */
  downloadUrl: string
  downloadFilename: string
}

export interface EpisodeRunStats {
  newsCandidates: number
  rankedStories: number
  researchedStories: number
  plannedStories: number
  coveredStories: number
  wordCount: number
  validation: { passed: boolean; errors: number; warnings: number; aiReview: string }
  audioBytes: number
  timingsMs: { news: number; ranking: number; research: number; script: number; audio: number; total: number }
}

export interface EpisodeResult {
  episode: GeneratedEpisode
  stats: EpisodeRunStats
}

/** One line of the POST /api/generate-episode stream (newline-delimited JSON). */
export type GenerationEvent =
  | ({ type: "progress" } & ProgressEvent)
  | ({ type: "result" } & EpisodeResult)
  | { type: "error"; stage?: FailureStage; message: string }
  | { type: "heartbeat" }
