import type { Tone } from "./settings"

/** The pipeline stages, in the order an episode goes through them. */
export const ANALYTICS_STAGES = ["news-discovery", "ranking", "research", "planning", "writing", "validation", "audio"] as const
export type AnalyticsStage = (typeof ANALYTICS_STAGES)[number]

export const API_PROVIDERS = ["openai", "tavily", "elevenlabs", "gnews"] as const
export type ApiProvider = (typeof API_PROVIDERS)[number]

// The raw analytics dataset. Every dashboard number is derived from these records (see src/lib/analytics), so a real
// source only has to return this shape from getAnalyticsData(). Timestamps are ISO strings (UTC).

export interface MockUser {
  id: string
  createdAt: string
  /** Language code, e.g. "en". */
  language: string
  interests: string[]
  tone: Tone
  preferredDurationMinutes: number
}

/** One generation attempt. Failed attempts are kept: they carry the failing stage and what it cost to get there. */
export interface MockEpisode {
  id: string
  userId: string
  createdAt: string
  durationSeconds: number
  language: string
  tone: Tone
  /** The interests the episode's stories belong to. */
  interests: string[]
  status: "success" | "failed"
  failedStage?: AnalyticsStage
  /** Seconds from generation start to the audio being ready (success) or to the failure (failed). */
  generationLatencySeconds: number
  /** Seconds spent in each stage that ran. */
  stageLatencySeconds: Partial<Record<AnalyticsStage, number>>
  storiesCount: number
  storyIds: string[]
}

export interface MockListeningSession {
  episodeId: string
  userId: string
  startedAt: string
  listenedSeconds: number
  /** Listened to at least 80% of the episode. */
  completed: boolean
}

/** Attributed to the period of the episode it rates. */
export interface MockFeedback {
  episodeId: string
  userId: string
  type: "like" | "dislike"
}

/** A story researched once and possibly reused by the episodes of several users. */
export interface MockResearchStory {
  storyId: string
  topic: string
  researchedAt: string
  /** Distinct users whose successful episodes used the story. */
  usersServed: number
  sourceCount: number
  researchCost: number
}

/** API usage aggregated per day, provider and stage. */
export interface MockApiUsage {
  timestamp: string
  provider: ApiProvider
  stage: AnalyticsStage
  requests: number
  /** EUR. */
  cost: number
  /** Average seconds per request. */
  latency: number
}

export interface AnalyticsData {
  users: MockUser[]
  episodes: MockEpisode[]
  sessions: MockListeningSession[]
  feedback: MockFeedback[]
  researchStories: MockResearchStory[]
  apiUsage: MockApiUsage[]
  /** First and last day covered (YYYY-MM-DD, UTC), both inclusive. */
  coverage: { startDate: string; endDate: string }
}
