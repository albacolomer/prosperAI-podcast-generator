import { describe, expect, it } from "vitest"
import { ANALYTICS_DAYS, generateMockAnalytics } from "@/data/analytics/generateMockAnalytics"
import type { AnalyticsData, DashboardRange, MockEpisode, MockUser } from "@/types"
import { computeDashboardMetrics } from "./metrics"

const RANGES: DashboardRange[] = [7, 30, 90]

const user = (id: string, createdAt: string): MockUser => ({
  id,
  createdAt,
  language: "en",
  interests: ["AI"],
  tone: "conversational",
  preferredDurationMinutes: 10,
})

const episode = (id: string, userId: string, createdAt: string, overrides: Partial<MockEpisode> = {}): MockEpisode => ({
  id,
  userId,
  createdAt,
  durationSeconds: 600,
  language: "en",
  tone: "conversational",
  interests: ["AI"],
  status: "success",
  generationLatencySeconds: 100,
  stageLatencySeconds: { research: 20, audio: 80 },
  storiesCount: 4,
  storyIds: [],
  ...overrides,
})

/** 20 days (Jan 1-20); the 7-day range is Jan 14-20 and the one before it Jan 7-13. */
const smallDataset = (): AnalyticsData => ({
  coverage: { startDate: "2026-01-01", endDate: "2026-01-20" },
  users: [
    user("u1", "2026-01-01T09:00:00Z"),
    user("u2", "2026-01-10T09:00:00Z"), // signed up in the 7-day retention cohort, came back on Jan 12
    user("u3", "2026-01-05T09:00:00Z"),
    user("u4", "2026-01-12T09:00:00Z"), // signed up in the cohort, never came back
  ],
  episodes: [
    episode("e1", "u1", "2026-01-15T10:00:00Z", { generationLatencySeconds: 100 }),
    episode("e2", "u1", "2026-01-15T20:00:00Z", { generationLatencySeconds: 200 }), // makes e1 a regeneration (10 hours later)
    episode("e3", "u3", "2026-01-16T08:00:00Z", { status: "failed", failedStage: "audio", generationLatencySeconds: 300 }),
    episode("e4", "u3", "2026-01-17T08:00:00Z", { durationSeconds: 1200, generationLatencySeconds: 120 }),
  ],
  sessions: [
    { episodeId: "e1", userId: "u1", startedAt: "2026-01-15T12:00:00Z", listenedSeconds: 600, completed: true },
    { episodeId: "e2", userId: "u1", startedAt: "2026-01-15T22:00:00Z", listenedSeconds: 300, completed: false },
    { episodeId: "e4", userId: "u2", startedAt: "2026-01-17T09:00:00Z", listenedSeconds: 30, completed: false }, // under 60 s: not active
    { episodeId: "e4", userId: "u2", startedAt: "2026-01-12T09:00:00Z", listenedSeconds: 30, completed: false }, // return within 7 days of signup
  ],
  feedback: [
    { episodeId: "e1", userId: "u1", type: "like" },
    { episodeId: "e2", userId: "u1", type: "dislike" },
    { episodeId: "e4", userId: "u3", type: "like" },
  ],
  researchStories: [
    { storyId: "a", topic: "AI", researchedAt: "2026-01-15T10:00:00Z", usersServed: 2, sourceCount: 6, researchCost: 0.1 },
    { storyId: "b", topic: "AI", researchedAt: "2026-01-16T10:00:00Z", usersServed: 1, sourceCount: 4, researchCost: 0.1 },
  ],
  apiUsage: [
    { timestamp: "2026-01-15T00:00:00Z", provider: "openai", stage: "ranking", requests: 2, cost: 1, latency: 4 },
    { timestamp: "2026-01-16T00:00:00Z", provider: "elevenlabs", stage: "audio", requests: 3, cost: 2, latency: 50 },
  ],
})

describe("metric definitions on a small dataset", () => {
  const m = computeDashboardMetrics(smallDataset(), 7)

  it("counts users, and active users by generation or 60 seconds of listening", () => {
    expect(m.overview.totalUsers.value).toBe(4)
    expect(m.overview.activeUsers.value).toBe(2) // u1 and u3 generated; u2 only listened for 30 seconds
    expect(m.overview.activeShare).toBeCloseTo(0.5)
  })

  it("counts only successful episodes as generated, and success rate over attempts", () => {
    expect(m.overview.episodesGenerated.value).toBe(3)
    expect(m.technology.successfulAttempts).toBe(3)
    expect(m.technology.failedAttempts).toBe(1)
    expect(m.technology.successRate.value).toBeCloseTo(0.75)
    expect(m.technology.failuresByStage.find((s) => s.stage === "audio")?.value).toBe(1)
    expect(m.usage.episodesPerActiveUser.value).toBeCloseTo(1.5)
  })

  it("computes completion, listen-through, likes and ratings from sessions and feedback", () => {
    expect(m.overview.startedEpisodes).toBe(3)
    expect(m.overview.completionRate.value).toBeCloseTo(1 / 3)
    expect(m.quality.averageListenThrough.value).toBeCloseTo((1 + 0.5 + 30 / 1200) / 3)
    expect(m.overview.likeRate.value).toBeCloseTo(2 / 3)
    expect(m.overview.ratingsCount).toBe(3)
    expect(m.quality.ratingRate.value).toBeCloseTo(1)
  })

  it("flags an episode followed by another attempt within 24 hours as regenerated", () => {
    expect(m.quality.regenerationRate.value).toBeCloseTo(1 / 3) // e1 only
  })

  it("computes retention over the cohort whose window closed in the period", () => {
    expect(m.overview.retention7dCohort).toBe(2) // u2 and u4 signed up Jan 7-13
    expect(m.overview.retention7d.value).toBeCloseTo(0.5)
    expect(m.usage.retention30d.value).toBeNull() // that cohort would start before the data does
  })

  it("averages duration and buckets it", () => {
    expect(m.content.averageDurationMinutes.value).toBeCloseTo(800 / 60)
    expect(m.content.durationBuckets.map((b) => b.value)).toEqual([0, 2, 1, 0])
  })

  it("averages latency over successful episodes only, per stage", () => {
    expect(m.technology.averageLatencySeconds.value).toBeCloseTo(140)
    expect(m.technology.latencyByStage.find((s) => s.stage === "research")?.value).toBeCloseTo(20)
    expect(m.technology.latencyByStage.find((s) => s.stage === "planning")?.value).toBe(0)
  })

  it("measures research reuse over stories researched in the period", () => {
    expect(m.personalization.researchedStories).toBe(2)
    expect(m.personalization.reusedStories).toBe(1)
    expect(m.personalization.researchReuseRate.value).toBeCloseTo(0.5)
    expect(m.personalization.averageUsersServed.value).toBeCloseTo(1.5)
    expect(m.technology.averageSourcesPerStory.value).toBeCloseTo(5)
  })

  it("divides cost by successful episodes and active users", () => {
    expect(m.economics.totalCost.value).toBeCloseTo(3)
    expect(m.economics.costPerSuccessfulEpisode.value).toBeCloseTo(1)
    expect(m.economics.costPerActiveUser.value).toBeCloseTo(1.5)
    expect(m.economics.costByProvider.map((p) => p.provider)).toEqual(["elevenlabs", "openai", "tavily", "gnews"])
  })

  it("has no previous period when the data does not reach back far enough", () => {
    const short = computeDashboardMetrics({ ...smallDataset(), coverage: { startDate: "2026-01-10", endDate: "2026-01-20" } }, 7)
    expect(short.overview.episodesGenerated.previous).toBeNull()
    expect(short.overview.totalUsers.previous).toBeNull()
  })

  it("returns null rather than NaN when a period is empty", () => {
    const empty = computeDashboardMetrics({ ...smallDataset(), episodes: [], sessions: [], feedback: [], researchStories: [], apiUsage: [] }, 7)
    expect(empty.overview.completionRate.value).toBeNull()
    expect(empty.overview.likeRate.value).toBeNull()
    expect(empty.economics.costPerSuccessfulEpisode.value).toBeNull()
    expect(empty.quality.completionTrend.every((point) => point.value === null)).toBe(true)
  })
})

describe("generated mock dataset", () => {
  const END = "2026-09-20"
  const data = generateMockAnalytics(END)

  it("is deterministic", () => {
    expect(JSON.stringify(generateMockAnalytics(END))).toBe(JSON.stringify(data))
  })

  it("covers well over 90 days and varies from day to day", () => {
    expect(ANALYTICS_DAYS).toBeGreaterThanOrEqual(120)
    const perDay = computeDashboardMetrics(data, 90).usage.episodesOverTime.map((p) => p.value)
    expect(perDay).toHaveLength(90)
    expect(new Set(perDay).size).toBeGreaterThan(30)
  })

  it("keeps its records consistent", () => {
    // Violations are collected and asserted once: tens of thousands of records make per-record expect() calls slow.
    const problems: string[] = []
    const storyById = new Map(data.researchStories.map((s) => [s.storyId, s]))
    const servedBy = new Map<string, Set<string>>()
    for (const e of data.episodes) {
      if (e.storyIds.length !== e.storiesCount) problems.push(`${e.id}: storiesCount`)
      if (e.status === "failed" && !e.failedStage) problems.push(`${e.id}: failed without a stage`)
      for (const id of e.storyIds) {
        if (!storyById.has(id)) problems.push(`${e.id}: unknown story ${id}`)
        if (e.status === "success") servedBy.set(id, (servedBy.get(id) ?? new Set()).add(e.userId))
      }
    }
    for (const story of data.researchStories) {
      if (story.usersServed !== (servedBy.get(story.storyId)?.size ?? 0)) problems.push(`${story.storyId}: usersServed`)
    }

    const episodeIds = new Set(data.episodes.filter((e) => e.status === "success").map((e) => e.id))
    const duration = new Map(data.episodes.map((e) => [e.id, e.durationSeconds]))
    for (const s of data.sessions) {
      if (!episodeIds.has(s.episodeId)) problems.push(`session on ${s.episodeId}`)
      else if (s.completed !== s.listenedSeconds >= 0.8 * duration.get(s.episodeId)!) problems.push(`session ${s.episodeId}: completed flag`)
    }
    for (const f of data.feedback) if (!episodeIds.has(f.episodeId)) problems.push(`feedback on ${f.episodeId}`)

    expect(problems).toEqual([])
    expect(data.researchStories.length).toBeGreaterThan(0)
    expect(data.sessions.length).toBeGreaterThan(0)
  })

  it("books research cost once per story, and costs add up by provider and by stage", () => {
    const researchCost = data.apiUsage.filter((u) => u.stage === "research").reduce((sum, u) => sum + u.cost, 0)
    expect(researchCost).toBeCloseTo(data.researchStories.reduce((sum, s) => sum + s.researchCost, 0), 6)

    for (const days of RANGES) {
      const { economics } = computeDashboardMetrics(data, days)
      const byProvider = economics.costByProvider.reduce((sum, p) => sum + p.value, 0)
      const byStage = economics.costByStage.reduce((sum, s) => sum + s.value, 0)
      expect(byProvider).toBeCloseTo(economics.totalCost.value, 6)
      expect(byStage).toBeCloseTo(economics.totalCost.value, 6)
    }
  })

  it("responds to the range, with totals that match the raw records", () => {
    const generated = RANGES.map((days) => computeDashboardMetrics(data, days).overview.episodesGenerated.value)
    expect(generated[0]).toBeLessThan(generated[1])
    expect(generated[1]).toBeLessThan(generated[2])

    for (const days of RANGES) {
      const m = computeDashboardMetrics(data, days)
      const start = Date.parse(`${END}T00:00:00Z`) + 86_400_000 - days * 86_400_000
      const inRange = data.episodes.filter((e) => e.status === "success" && Date.parse(e.createdAt) >= start)
      expect(m.overview.episodesGenerated.value).toBe(inRange.length)
      expect(m.usage.episodesOverTime.reduce((sum, p) => sum + (p.value ?? 0), 0)).toBe(inRange.length)
      expect(m.content.topInterests.every((i, n, all) => n === 0 || all[n - 1].value >= i.value)).toBe(true)
      expect(m.content.tones.reduce((sum, t) => sum + t.value, 0)).toBe(inRange.length)
      expect(m.content.languages.reduce((sum, l) => sum + l.value, 0)).toBe(inRange.length)
      expect(m.content.durationBuckets.reduce((sum, b) => sum + b.value, 0)).toBe(inRange.length)
    }
  })

  it("yields plausible rates and no NaN or infinite numbers in any range", () => {
    for (const days of RANGES) {
      const m = computeDashboardMetrics(data, days)
      const bad: string[] = []
      const walk = (value: unknown, path: string) => {
        if (typeof value === "number" && !Number.isFinite(value)) bad.push(path)
        else if (value && typeof value === "object") for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`)
      }
      walk(m, "metrics")
      expect(bad).toEqual([])

      for (const rate of [m.overview.completionRate, m.overview.likeRate, m.overview.retention7d, m.quality.regenerationRate, m.technology.successRate, m.personalization.researchReuseRate]) {
        expect(rate.value).not.toBeNull()
        expect(rate.value!).toBeGreaterThan(0)
        expect(rate.value!).toBeLessThan(1)
      }
      expect(m.overview.activeUsers.value).toBeLessThanOrEqual(m.overview.totalUsers.value)
    }
  })

  it("reports weekly rate points for 90 days and daily ones for 30", () => {
    expect(computeDashboardMetrics(data, 30).quality.completionTrend).toHaveLength(30)
    const weekly = computeDashboardMetrics(data, 90).quality.completionTrend
    expect(weekly).toHaveLength(13)
    expect(weekly.reduce((sum, p) => sum + p.days, 0)).toBe(90)
    // 30 days is 4 weeks and 2 days: the 2 days join the first week instead of forming a noisy bucket of their own.
    const likes = computeDashboardMetrics(data, 30).quality.likeTrend
    expect(likes.map((p) => p.days)).toEqual([9, 7, 7, 7])
    expect(computeDashboardMetrics(data, 7).quality.likeTrend).toHaveLength(7)
  })
})
