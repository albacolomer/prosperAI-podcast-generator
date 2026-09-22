import type { ApiProvider, AnalyticsStage } from "./analytics"

export type DashboardRange = 7 | 30 | 90

/** A metric for the selected period and, when the dataset reaches back far enough, for the period before it. */
export interface KpiValue {
  value: number
  previous: number | null
}

/** A rate whose denominator can be zero, so it may be undefined. */
export interface RateValue {
  value: number | null
  previous: number | null
}

export interface TrendPoint {
  /** First day of the bucket (YYYY-MM-DD). */
  date: string
  /** Days the bucket spans: 1 for daily points, 7 for weekly ones. */
  days: number
  value: number | null
}

/** How a dimension's rows (interests, languages, tones, duration buckets) engage: not just how often they get generated, but how they land. */
export interface DimensionEngagement {
  name: string
  episodes: number
  startedEpisodes: number
  completionRate: number | null
  ratings: number
  likeRate: number | null
}

export const CONTENT_DIMENSIONS = ["interest", "language", "tone", "duration"] as const
export type ContentDimension = (typeof CONTENT_DIMENSIONS)[number]

export interface StageValue {
  stage: AnalyticsStage
  label: string
  value: number
}

export interface ProviderValue {
  provider: ApiProvider
  label: string
  value: number
}

export interface DashboardMetrics {
  range: { days: DashboardRange; startDate: string; endDate: string }

  overview: {
    totalUsers: KpiValue
    activeUsers: KpiValue
    /** Active users as a share of total users. */
    activeShare: number | null
    /** Active users (generated or listened 60s+) in the trailing 7 days, independent of the selected range. */
    weeklyActiveUsers: KpiValue
    /** Same definition, trailing 30 days. */
    monthlyActiveUsers: KpiValue
    episodesGenerated: KpiValue
    completionRate: RateValue
    startedEpisodes: number
    likeRate: RateValue
    dislikeRate: RateValue
    ratingsCount: number
    retention7d: RateValue
    retention7dCohort: number
  }

  usage: {
    episodesOverTime: TrendPoint[]
    episodesPerActiveUser: RateValue
    retention7d: RateValue
    retention7dCohort: number
    retention30d: RateValue
    retention30dCohort: number
  }

  content: {
    /** The same underlying podcasts, sessions and feedback, tallied per dimension so one table can show any of them. */
    engagementByDimension: Record<ContentDimension, DimensionEngagement[]>
  }

  quality: {
    completionTrend: TrendPoint[]
    likeTrend: TrendPoint[]
    dislikeTrend: TrendPoint[]
    averageListenThrough: RateValue
    ratingRate: RateValue
  }

  personalization: {
    researchedStories: number
    reusedStories: number
    researchReuseRate: RateValue
    averageUsersServed: RateValue
  }

  technology: {
    averageLatencySeconds: RateValue
    latencyByStage: StageValue[]
    successRate: RateValue
    successfulAttempts: number
    failedAttempts: number
    failuresByStage: StageValue[]
    averageStoriesPerEpisode: RateValue
    averageSourcesPerStory: RateValue
  }

  economics: {
    totalCost: KpiValue
    costPerSuccessfulEpisode: RateValue
    costPerActiveUser: RateValue
    costByProvider: ProviderValue[]
    costByStage: StageValue[]
    requestsByStage: StageValue[]
  }
}
