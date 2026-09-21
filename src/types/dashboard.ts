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

export interface NamedValue {
  name: string
  value: number
}

export interface InterestEngagement {
  interest: string
  episodes: number
  startedEpisodes: number
  completionRate: number | null
  ratings: number
  likeRate: number | null
}

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
    episodesGenerated: KpiValue
    completionRate: RateValue
    startedEpisodes: number
    likeRate: RateValue
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
    topInterests: NamedValue[]
    interestEngagement: InterestEngagement[]
    languages: NamedValue[]
    tones: NamedValue[]
    averageDurationMinutes: RateValue
    durationBuckets: NamedValue[]
  }

  quality: {
    completionTrend: TrendPoint[]
    likeTrend: TrendPoint[]
    averageListenThrough: RateValue
    ratingRate: RateValue
    regenerationRate: RateValue
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
