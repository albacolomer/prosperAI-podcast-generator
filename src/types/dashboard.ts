export interface KpiStat {
  id: string
  label: string
  value: number
  delta: number
  deltaDirection: "up" | "down" | "flat"
  format: "number" | "percent"
}

export interface TrendPoint {
  date: string
  value: number
}

export interface NamedSeriesPoint {
  name: string
  value: number
}

export interface RetentionPoint {
  weeksSinceSignup: number
  retentionPercent: number
}

export interface DashboardMetrics {
  kpis: {
    totalUsers: KpiStat
    dau: KpiStat
    wau: KpiStat
    mau: KpiStat
    episodesGenerated: KpiStat
    avgCompletionRate: KpiStat
  }
  episodesOverTime: TrendPoint[]
  activeUsersOverTime: TrendPoint[]
  completionRateOverTime: TrendPoint[]
  topInterests: NamedSeriesPoint[]
  voicePopularity: NamedSeriesPoint[]
  languageDistribution: NamedSeriesPoint[]
  scheduleFrequencyDistribution: NamedSeriesPoint[]
  retentionByWeek: RetentionPoint[]
}
