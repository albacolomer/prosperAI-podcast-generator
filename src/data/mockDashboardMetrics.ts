import type { DashboardMetrics, KpiStat, NamedSeriesPoint, RetentionPoint, TrendPoint } from "@/types"

const TREND_DAYS = 90

function mulberry32(seed: number) {
  let state = seed
  return function random() {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function buildDateAxis(days: number): string[] {
  const dates: string[] = []
  const today = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    dates.push(d.toISOString().slice(0, 10))
  }
  return dates
}

interface TrendOptions {
  startValue: number
  endValue: number
  weekendDipRatio?: number
  noiseRatio?: number
  ceiling?: number
}

function buildTrend(seed: number, options: TrendOptions): TrendPoint[] {
  const { startValue, endValue, weekendDipRatio = 0, noiseRatio = 0.04, ceiling } = options
  const random = mulberry32(seed)
  const dates = buildDateAxis(TREND_DAYS)
  return dates.map((date, index) => {
    const progress = index / (TREND_DAYS - 1)
    const base = startValue + (endValue - startValue) * progress
    const dayOfWeek = new Date(`${date}T00:00:00Z`).getUTCDay()
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
    const weekendAdjustment = isWeekend ? 1 - weekendDipRatio : 1
    const noise = 1 + (random() - 0.5) * 2 * noiseRatio
    let value = Math.max(0, base * weekendAdjustment * noise)
    if (ceiling !== undefined) value = Math.min(ceiling, value)
    return { date, value: Math.round(value) }
  })
}

function kpi(
  id: string,
  label: string,
  value: number,
  delta: number,
  deltaDirection: KpiStat["deltaDirection"],
  format: KpiStat["format"],
): KpiStat {
  return { id, label, value, delta, deltaDirection, format }
}

const episodesOverTime = buildTrend(1, { startValue: 320, endValue: 640, weekendDipRatio: 0.35, noiseRatio: 0.08 })
const activeUsersOverTime = buildTrend(2, { startValue: 3400, endValue: 5200, weekendDipRatio: 0.15, noiseRatio: 0.05 })
const completionRateOverTime = buildTrend(3, { startValue: 71, endValue: 78, noiseRatio: 0.035, ceiling: 100 })

const topInterests: NamedSeriesPoint[] = [
  { name: "Artificial Intelligence", value: 3120 },
  { name: "Personal Finance", value: 2430 },
  { name: "Climate Tech", value: 1980 },
  { name: "Space Exploration", value: 1710 },
  { name: "Formula 1", value: 1540 },
  { name: "Startups", value: 1225 },
  { name: "Health & Wellness", value: 980 },
  { name: "Cryptocurrency", value: 860 },
]

const voicePopularity: NamedSeriesPoint[] = [
  { name: "Nova", value: 28 },
  { name: "Orion", value: 21 },
  { name: "Sage", value: 18 },
  { name: "Atlas", value: 15 },
  { name: "Wren", value: 11 },
  { name: "Juniper", value: 7 },
]

const languageDistribution: NamedSeriesPoint[] = [
  { name: "English", value: 61 },
  { name: "Spanish", value: 14 },
  { name: "French", value: 8 },
  { name: "German", value: 6 },
  { name: "Portuguese", value: 5 },
  { name: "Japanese", value: 3 },
  { name: "Other", value: 3 },
]

const scheduleFrequencyDistribution: NamedSeriesPoint[] = [
  { name: "Daily", value: 58 },
  { name: "Weekdays", value: 24 },
  { name: "Weekly", value: 13 },
  { name: "Custom", value: 5 },
]

const retentionByWeek: RetentionPoint[] = [
  { weeksSinceSignup: 0, retentionPercent: 100 },
  { weeksSinceSignup: 1, retentionPercent: 68 },
  { weeksSinceSignup: 2, retentionPercent: 54 },
  { weeksSinceSignup: 3, retentionPercent: 47 },
  { weeksSinceSignup: 4, retentionPercent: 42 },
  { weeksSinceSignup: 5, retentionPercent: 38 },
  { weeksSinceSignup: 6, retentionPercent: 35 },
  { weeksSinceSignup: 7, retentionPercent: 32 },
]

export const mockDashboardMetrics: DashboardMetrics = {
  kpis: {
    totalUsers: kpi("total-users", "Total Users", 8412, 4.2, "up", "number"),
    dau: kpi("dau", "Daily Active Users", 642, 2.1, "up", "number"),
    wau: kpi("wau", "Weekly Active Users", 2105, -1.3, "down", "number"),
    mau: kpi("mau", "Monthly Active Users", 5230, 6.8, "up", "number"),
    episodesGenerated: kpi("episodes-generated", "Episodes Generated", 46280, 12.4, "up", "number"),
    avgCompletionRate: kpi("avg-completion-rate", "Avg. Completion Rate", 78, 1.5, "up", "percent"),
  },
  episodesOverTime,
  activeUsersOverTime,
  completionRateOverTime,
  topInterests,
  voicePopularity,
  languageDistribution,
  scheduleFrequencyDistribution,
  retentionByWeek,
}
