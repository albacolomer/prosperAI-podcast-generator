import { mockLanguages } from "@/data/mockLanguages"
import { tones } from "@/data/tones"
import {
  API_PROVIDERS,
  ANALYTICS_STAGES,
  type AnalyticsData,
  type ApiProvider,
  type ContentDimension,
  type DashboardMetrics,
  type DashboardRange,
  type DimensionEngagement,
  type KpiValue,
  type MockEpisode,
  type MockListeningSession,
  type AnalyticsStage,
  type ProviderValue,
  type RateValue,
  type StageValue,
  type TrendPoint,
} from "@/types"

// Every dashboard number is computed here from the raw records in AnalyticsData. Definitions:
//  - active user: generated a podcast, or listened to at least 60 seconds, during the period.
//  - weekly/monthly active users: active users in the trailing 7 or 30 days, independent of the selected range.
//  - completed: listened to at least 80% of the podcast (the session's `completed` flag). Completion rate = completed / started podcasts.
//  - like rate: likes / (likes + dislikes), over the podcasts generated in the period. Dislike rate is the complement.
//  - rating rate: (likes + dislikes) / podcasts generated.
//  - N-day retention: of the users who signed up N days before the period ended (a cohort whose window has closed), the share
//    that generated or listened on any later day within N days of signing up.
//  - research reuse rate: researched stories that served more than one user.

const DAY_MS = 86_400_000
const ACTIVE_LISTEN_SECONDS = 60

export const STAGE_LABELS: Record<AnalyticsStage, string> = {
  "news-discovery": "News Discovery",
  ranking: "Ranking",
  research: "Research",
  planning: "Planning",
  writing: "Writing",
  validation: "Validation",
  audio: "Audio",
}

export const PROVIDER_LABELS: Record<ApiProvider, string> = {
  openai: "OpenAI",
  tavily: "Tavily",
  elevenlabs: "ElevenLabs",
  gnews: "GNews",
}

export const DURATION_BUCKETS = ["5–10 min", "10–20 min", "20–30 min", "30+ min"] as const

interface Timed<T> {
  item: T
  ms: number
}

/** Timestamps parsed once, plus the lookups the metrics share. Built once per dataset. */
interface Index {
  data: AnalyticsData
  coverageStartMs: number
  coverageEndMs: number
  users: Timed<AnalyticsData["users"][number]>[]
  episodes: Timed<MockEpisode>[]
  sessions: Timed<MockListeningSession>[]
  stories: Timed<AnalyticsData["researchStories"][number]>[]
  usage: Timed<AnalyticsData["apiUsage"][number]>[]
  episodeById: Map<string, MockEpisode>
  feedbackByEpisode: Map<string, { likes: number; dislikes: number }>
  /** UTC day numbers on which each user generated or listened, ascending. */
  activityDays: Map<string, number[]>
}

interface Period {
  startMs: number
  endMs: number
}

const indexCache = new WeakMap<AnalyticsData, Index>()

const dayNumber = (ms: number) => Math.floor(ms / DAY_MS)
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const inPeriod = (ms: number, period: Period) => ms >= period.startMs && ms < period.endMs

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null
}

function buildIndex(data: AnalyticsData): Index {
  const cached = indexCache.get(data)
  if (cached) return cached

  const timed = <T extends object>(items: T[], timestamp: (item: T) => string): Timed<T>[] =>
    items.map((item) => ({ item, ms: Date.parse(timestamp(item)) }))

  const episodes = timed(data.episodes, (e) => e.createdAt).sort((a, b) => a.ms - b.ms)
  const sessions = timed(data.sessions, (s) => s.startedAt)

  const feedbackByEpisode = new Map<string, { likes: number; dislikes: number }>()
  for (const entry of data.feedback) {
    const counts = feedbackByEpisode.get(entry.episodeId) ?? { likes: 0, dislikes: 0 }
    if (entry.type === "like") counts.likes++
    else counts.dislikes++
    feedbackByEpisode.set(entry.episodeId, counts)
  }

  const activityDays = new Map<string, Set<number>>()
  const markActive = (userId: string, ms: number) => {
    const days = activityDays.get(userId) ?? new Set<number>()
    days.add(dayNumber(ms))
    activityDays.set(userId, days)
  }
  for (const { item, ms } of episodes) if (item.status === "success") markActive(item.userId, ms)
  for (const { item, ms } of sessions) markActive(item.userId, ms)

  const index: Index = {
    data,
    coverageStartMs: Date.parse(`${data.coverage.startDate}T00:00:00Z`),
    coverageEndMs: Date.parse(`${data.coverage.endDate}T00:00:00Z`) + DAY_MS,
    users: timed(data.users, (u) => u.createdAt),
    episodes,
    sessions,
    stories: timed(data.researchStories, (s) => s.researchedAt),
    usage: timed(data.apiUsage, (u) => u.timestamp),
    episodeById: new Map(data.episodes.map((episode) => [episode.id, episode])),
    feedbackByEpisode,
    activityDays: new Map([...activityDays].map(([userId, days]) => [userId, [...days].sort((a, b) => a - b)])),
  }
  indexCache.set(data, index)
  return index
}

/** Podcasts, starts, completions and ratings tallied for one row of one dimension (an interest, a language, a tone, a duration bucket). */
interface DimensionTally {
  episodes: number
  started: number
  completed: number
  likes: number
  dislikes: number
}

const emptyTally = (): DimensionTally => ({ episodes: 0, started: 0, completed: 0, likes: 0, dislikes: 0 })

interface PeriodStats {
  totalUsers: number
  activeUsers: number
  generated: number
  attempts: number
  failed: number
  started: number
  completed: number
  listenThroughSum: number
  likes: number
  dislikes: number
  durationSum: number
  storiesSum: number
  latencySum: number
  stageLatencySum: Record<AnalyticsStage, number>
  stageLatencyCount: Record<AnalyticsStage, number>
  failuresByStage: Record<AnalyticsStage, number>
  researched: number
  reused: number
  usersServedSum: number
  sourcesSum: number
  cost: number
  costByProvider: Record<ApiProvider, number>
  costByStage: Record<AnalyticsStage, number>
  requestsByStage: Record<AnalyticsStage, number>
  interests: Map<string, DimensionTally>
  languages: Map<string, DimensionTally>
  tones: Map<string, DimensionTally>
  /** Fixed length 4, indexed by durationBucket(). */
  durationBuckets: DimensionTally[]
}

const perStage = <T>(initial: T): Record<AnalyticsStage, T> => Object.fromEntries(ANALYTICS_STAGES.map((stage) => [stage, initial])) as Record<AnalyticsStage, T>
const perProvider = <T>(initial: T): Record<ApiProvider, T> => Object.fromEntries(API_PROVIDERS.map((provider) => [provider, initial])) as Record<ApiProvider, T>

function durationBucket(seconds: number): number {
  const minutes = seconds / 60
  if (minutes < 10) return 0
  if (minutes < 20) return 1
  if (minutes < 30) return 2
  return 3
}

function periodStats(index: Index, period: Period): PeriodStats {
  const stats: PeriodStats = {
    totalUsers: index.users.filter((user) => user.ms < period.endMs).length,
    activeUsers: 0,
    generated: 0,
    attempts: 0,
    failed: 0,
    started: 0,
    completed: 0,
    listenThroughSum: 0,
    likes: 0,
    dislikes: 0,
    durationSum: 0,
    storiesSum: 0,
    latencySum: 0,
    stageLatencySum: perStage(0),
    stageLatencyCount: perStage(0),
    failuresByStage: perStage(0),
    researched: 0,
    reused: 0,
    usersServedSum: 0,
    sourcesSum: 0,
    cost: 0,
    costByProvider: perProvider(0),
    costByStage: perStage(0),
    requestsByStage: perStage(0),
    interests: new Map(),
    languages: new Map(),
    tones: new Map(),
    durationBuckets: [emptyTally(), emptyTally(), emptyTally(), emptyTally()],
  }

  const active = new Set<string>()
  const tally = (map: Map<string, DimensionTally>, key: string) => {
    let entry = map.get(key)
    if (!entry) map.set(key, (entry = emptyTally()))
    return entry
  }

  for (const { item: episode, ms } of index.episodes) {
    if (!inPeriod(ms, period)) continue
    stats.attempts++
    if (episode.status === "failed") {
      stats.failed++
      if (episode.failedStage) stats.failuresByStage[episode.failedStage]++
      continue
    }
    stats.generated++
    active.add(episode.userId)
    stats.durationSum += episode.durationSeconds
    stats.storiesSum += episode.storiesCount
    stats.latencySum += episode.generationLatencySeconds
    for (const stage of ANALYTICS_STAGES) {
      const seconds = episode.stageLatencySeconds[stage]
      if (seconds === undefined) continue
      stats.stageLatencySum[stage] += seconds
      stats.stageLatencyCount[stage]++
    }

    const ratings = index.feedbackByEpisode.get(episode.id)
    if (ratings) {
      stats.likes += ratings.likes
      stats.dislikes += ratings.dislikes
    }
    const addRatings = (entry: DimensionTally) => {
      if (!ratings) return
      entry.likes += ratings.likes
      entry.dislikes += ratings.dislikes
    }
    for (const interest of episode.interests) {
      const entry = tally(stats.interests, interest)
      entry.episodes++
      addRatings(entry)
    }
    const languageEntry = tally(stats.languages, episode.language)
    languageEntry.episodes++
    addRatings(languageEntry)
    const toneEntry = tally(stats.tones, episode.tone)
    toneEntry.episodes++
    addRatings(toneEntry)
    const bucketEntry = stats.durationBuckets[durationBucket(episode.durationSeconds)]
    bucketEntry.episodes++
    addRatings(bucketEntry)
  }

  for (const { item: session, ms } of index.sessions) {
    if (!inPeriod(ms, period)) continue
    const episode = index.episodeById.get(session.episodeId)
    if (!episode) continue
    if (session.listenedSeconds >= ACTIVE_LISTEN_SECONDS) active.add(session.userId)
    stats.started++
    stats.listenThroughSum += Math.min(1, session.listenedSeconds / episode.durationSeconds)
    if (session.completed) stats.completed++
    const addStart = (entry: DimensionTally) => {
      entry.started++
      if (session.completed) entry.completed++
    }
    for (const interest of episode.interests) addStart(tally(stats.interests, interest))
    addStart(tally(stats.languages, episode.language))
    addStart(tally(stats.tones, episode.tone))
    addStart(stats.durationBuckets[durationBucket(episode.durationSeconds)])
  }
  stats.activeUsers = active.size

  for (const { item: story, ms } of index.stories) {
    if (!inPeriod(ms, period)) continue
    stats.researched++
    if (story.usersServed > 1) stats.reused++
    stats.usersServedSum += story.usersServed
    stats.sourcesSum += story.sourceCount
  }

  for (const { item: usage, ms } of index.usage) {
    if (!inPeriod(ms, period)) continue
    stats.cost += usage.cost
    stats.costByProvider[usage.provider] += usage.cost
    stats.costByStage[usage.stage] += usage.cost
    stats.requestsByStage[usage.stage] += usage.requests
  }

  return stats
}

/** Share of a cohort (users who signed up in the window ending `days` before the period ends) that came back within `days` days. */
function retention(index: Index, period: Period, days: number): { rate: number | null; cohort: number } | null {
  const cohortStart = period.startMs - days * DAY_MS
  // A cohort that starts before the data does would look less loyal than it was, as its early activity is missing.
  if (cohortStart < index.coverageStartMs) return null
  const cohortEnd = period.endMs - days * DAY_MS
  let cohort = 0
  let returned = 0
  for (const { item: user, ms } of index.users) {
    if (ms < cohortStart || ms >= cohortEnd) continue
    cohort++
    const signupDay = dayNumber(ms)
    const activity = index.activityDays.get(user.id) ?? []
    if (activity.some((day) => day > signupDay && day <= signupDay + days)) returned++
  }
  return { rate: ratio(returned, cohort), cohort }
}

function rangePeriods(index: Index, days: number): { current: Period; previous: Period | null } {
  const current = { startMs: index.coverageEndMs - days * DAY_MS, endMs: index.coverageEndMs }
  const previous = { startMs: current.startMs - days * DAY_MS, endMs: current.startMs }
  return { current, previous: previous.startMs >= index.coverageStartMs ? previous : null }
}

/** Daily buckets, or weekly ones ending on the last day. A leftover of under 4 days at the start joins the first week rather than standing alone. */
function buildBuckets(period: Period, granularity: "daily" | "weekly"): Period[] {
  const step = granularity === "daily" ? DAY_MS : 7 * DAY_MS
  const buckets: Period[] = []
  for (let endMs = period.endMs; endMs > period.startMs; endMs -= step) {
    buckets.unshift({ startMs: Math.max(period.startMs, endMs - step), endMs })
  }
  if (granularity === "weekly" && buckets.length > 1 && buckets[0].endMs - buckets[0].startMs < 4 * DAY_MS) {
    const [leftover, first, ...rest] = buckets
    return [{ startMs: leftover.startMs, endMs: first.endMs }, ...rest]
  }
  return buckets
}

const toPoint = (bucket: Period, value: number | null): TrendPoint => ({
  date: isoDay(bucket.startMs),
  days: Math.round((bucket.endMs - bucket.startMs) / DAY_MS),
  value,
})

function episodesOverTime(index: Index, period: Period): TrendPoint[] {
  return buildBuckets(period, "daily").map((bucket) => {
    let count = 0
    for (const { item, ms } of index.episodes) if (item.status === "success" && inPeriod(ms, bucket)) count++
    return toPoint(bucket, count)
  })
}

function rateTrends(index: Index, period: Period, days: number): { completion: TrendPoint[]; like: TrendPoint[]; dislike: TrendPoint[] } {
  // Daily rates get noisy over long ranges (and ratings are rare: about one episode in five), so they are shown weekly.
  const completionBuckets = buildBuckets(period, days > 30 ? "weekly" : "daily")
  const likeBuckets = buildBuckets(period, days > 7 ? "weekly" : "daily")
  const completion = completionBuckets.map((bucket) => {
    let started = 0
    let completed = 0
    for (const { item, ms } of index.sessions) {
      if (!inPeriod(ms, bucket)) continue
      started++
      if (item.completed) completed++
    }
    return toPoint(bucket, ratio(completed, started))
  })
  const like: TrendPoint[] = []
  const dislike: TrendPoint[] = []
  for (const bucket of likeBuckets) {
    let likes = 0
    let ratings = 0
    for (const { item, ms } of index.episodes) {
      if (item.status !== "success" || !inPeriod(ms, bucket)) continue
      const counts = index.feedbackByEpisode.get(item.id)
      if (!counts) continue
      likes += counts.likes
      ratings += counts.likes + counts.dislikes
    }
    like.push(toPoint(bucket, ratio(likes, ratings)))
    dislike.push(toPoint(bucket, ratio(ratings - likes, ratings)))
  }
  return { completion, like, dislike }
}

const kpi = (value: number, previous: number | null): KpiValue => ({ value, previous })
const rate = (value: number | null, previous: number | null): RateValue => ({ value, previous })

const languageLabel = (code: string) => mockLanguages.find((language) => language.code === code)?.label ?? code.toUpperCase()

/** A dimension's tallies, turned into ranked table rows. Duration buckets pass their own order instead (short to long, not by volume). */
function toEngagement(entries: [string, DimensionTally][], rank = true): DimensionEngagement[] {
  const rows = entries.map(([name, t]) => ({
    name,
    episodes: t.episodes,
    startedEpisodes: t.started,
    completionRate: ratio(t.completed, t.started),
    ratings: t.likes + t.dislikes,
    likeRate: ratio(t.likes, t.likes + t.dislikes),
  }))
  return rank ? rows.sort((a, b) => b.episodes - a.episodes || a.name.localeCompare(b.name)) : rows
}

export function computeDashboardMetrics(data: AnalyticsData, days: DashboardRange): DashboardMetrics {
  const index = buildIndex(data)
  const { current: period, previous: previousPeriod } = rangePeriods(index, days)
  const now = periodStats(index, period)
  const before = previousPeriod ? periodStats(index, previousPeriod) : null

  // Every metric goes through `both`, which yields null for the previous period when the dataset does not reach back far enough.
  const both = <T>(pick: (stats: PeriodStats) => T): [T, T | null] => [pick(now), before ? pick(before) : null]
  const kpiOf = (pick: (stats: PeriodStats) => number) => {
    const [value, previous] = both(pick)
    return kpi(value, previous)
  }
  const rateOf = (pick: (stats: PeriodStats) => number | null) => {
    const [value, previous] = both(pick)
    return rate(value, previous)
  }

  const completionRate = (s: PeriodStats) => ratio(s.completed, s.started)
  const likeRate = (s: PeriodStats) => ratio(s.likes, s.likes + s.dislikes)
  const dislikeRate = (s: PeriodStats) => ratio(s.dislikes, s.likes + s.dislikes)
  const successRate = (s: PeriodStats) => ratio(s.generated, s.attempts)

  const retention7 = retention(index, period, 7)
  const retention7Previous = previousPeriod ? retention(index, previousPeriod, 7) : null
  const retention30 = retention(index, period, 30)
  const retention30Previous = previousPeriod ? retention(index, previousPeriod, 30) : null

  // WAU/MAU are trailing 7- and 30-day windows anchored to the most recent day of data, not to the selected range:
  // picking "Last 90 days" still reports this week's and this month's active users, not the range's.
  const week = rangePeriods(index, 7)
  const weekStats = periodStats(index, week.current)
  const weekPrevious = week.previous ? periodStats(index, week.previous) : null
  const month = rangePeriods(index, 30)
  const monthStats = periodStats(index, month.current)
  const monthPrevious = month.previous ? periodStats(index, month.previous) : null

  const trends = rateTrends(index, period, days)

  const stageValues = (values: Record<AnalyticsStage, number>): StageValue[] =>
    ANALYTICS_STAGES.map((stage) => ({ stage, label: STAGE_LABELS[stage], value: values[stage] }))

  const engagementByDimension: Record<ContentDimension, DimensionEngagement[]> = {
    interest: toEngagement([...now.interests]),
    language: toEngagement([...now.languages].map(([code, t]): [string, DimensionTally] => [languageLabel(code), t])),
    tone: toEngagement(tones.map((tone): [string, DimensionTally] => [tone.label, now.tones.get(tone.id) ?? emptyTally()])),
    duration: toEngagement(
      DURATION_BUCKETS.map((name, i): [string, DimensionTally] => [name, now.durationBuckets[i]]),
      false,
    ),
  }

  const averageLatency = (s: PeriodStats) => ratio(s.latencySum, s.generated)

  const stageAverages = Object.fromEntries(
    ANALYTICS_STAGES.map((stage) => [stage, now.stageLatencyCount[stage] > 0 ? now.stageLatencySum[stage] / now.stageLatencyCount[stage] : 0]),
  ) as Record<AnalyticsStage, number>

  const costByProvider: ProviderValue[] = API_PROVIDERS.map((provider) => ({
    provider,
    label: PROVIDER_LABELS[provider],
    value: now.costByProvider[provider],
  })).sort((a, b) => b.value - a.value)

  return {
    range: { days, startDate: isoDay(period.startMs), endDate: isoDay(period.endMs - DAY_MS) },

    overview: {
      totalUsers: kpiOf((s) => s.totalUsers),
      activeUsers: kpiOf((s) => s.activeUsers),
      activeShare: ratio(now.activeUsers, now.totalUsers),
      weeklyActiveUsers: kpi(weekStats.activeUsers, weekPrevious?.activeUsers ?? null),
      monthlyActiveUsers: kpi(monthStats.activeUsers, monthPrevious?.activeUsers ?? null),
      episodesGenerated: kpiOf((s) => s.generated),
      completionRate: rateOf(completionRate),
      startedEpisodes: now.started,
      likeRate: rateOf(likeRate),
      dislikeRate: rateOf(dislikeRate),
      ratingsCount: now.likes + now.dislikes,
      retention7d: rate(retention7?.rate ?? null, retention7Previous?.rate ?? null),
      retention7dCohort: retention7?.cohort ?? 0,
    },

    usage: {
      episodesOverTime: episodesOverTime(index, period),
      episodesPerActiveUser: rateOf((s) => ratio(s.generated, s.activeUsers)),
      retention7d: rate(retention7?.rate ?? null, retention7Previous?.rate ?? null),
      retention7dCohort: retention7?.cohort ?? 0,
      retention30d: rate(retention30?.rate ?? null, retention30Previous?.rate ?? null),
      retention30dCohort: retention30?.cohort ?? 0,
    },

    content: {
      engagementByDimension,
    },

    quality: {
      completionTrend: trends.completion,
      likeTrend: trends.like,
      dislikeTrend: trends.dislike,
      averageListenThrough: rateOf((s) => ratio(s.listenThroughSum, s.started)),
      ratingRate: rateOf((s) => ratio(s.likes + s.dislikes, s.generated)),
    },

    personalization: {
      researchedStories: now.researched,
      reusedStories: now.reused,
      researchReuseRate: rateOf((s) => ratio(s.reused, s.researched)),
      averageUsersServed: rateOf((s) => ratio(s.usersServedSum, s.researched)),
    },

    technology: {
      averageLatencySeconds: rateOf(averageLatency),
      latencyByStage: stageValues(stageAverages),
      successRate: rateOf(successRate),
      successfulAttempts: now.generated,
      failedAttempts: now.failed,
      failuresByStage: stageValues(now.failuresByStage),
      averageStoriesPerEpisode: rateOf((s) => ratio(s.storiesSum, s.generated)),
      averageSourcesPerStory: rateOf((s) => ratio(s.sourcesSum, s.researched)),
    },

    economics: {
      totalCost: kpiOf((s) => s.cost),
      costPerSuccessfulEpisode: rateOf((s) => ratio(s.cost, s.generated)),
      costPerActiveUser: rateOf((s) => ratio(s.cost, s.activeUsers)),
      costByProvider,
      costByStage: stageValues(now.costByStage),
      requestsByStage: stageValues(now.requestsByStage),
    },
  }
}
