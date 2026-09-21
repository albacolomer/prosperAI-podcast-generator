import type {
  AnalyticsData,
  ApiProvider,
  MockApiUsage,
  MockEpisode,
  MockFeedback,
  MockListeningSession,
  MockResearchStory,
  MockUser,
  AnalyticsStage,
  Tone,
} from "@/types"
import { ANALYTICS_STAGES } from "@/types"

// Simulates ProsperPod usage day by day and records what happened. Nothing here is a dashboard number: the records
// are the only output, and src/lib/analytics derives every metric from them, so the figures cannot contradict each other.
// The simulation is deterministic (fixed seed, no Math.random, no clock): the same end date always gives the same dataset.
//
// It assumes research is shared: a story is researched (and paid for) at its first use and reused by later episodes.

const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000
const MINUTE_MS = 60_000

/** Days of history. More than the largest range (90) so the previous-period comparison and the 30-day retention cohorts exist. */
export const ANALYTICS_DAYS = 200

const SEED = 20260921
const LEGACY_USERS = 700
const LEGACY_SPAN_DAYS = 240

interface InterestProfile {
  name: string
  /** How likely a user is to follow it. */
  weight: number
  /** Distinct stories the news pool holds for it on a given day. */
  poolSize: number
  /** Shift in how much people listen to episodes about it. */
  engagement: number
  /** Typical number of sources behind one researched story. */
  sources: number
}

const INTERESTS: InterestProfile[] = [
  { name: "Artificial Intelligence", weight: 0.95, poolSize: 80, engagement: 0.05, sources: 7 },
  { name: "Personal Finance", weight: 0.6, poolSize: 56, engagement: 0.0, sources: 6 },
  { name: "Climate Tech", weight: 0.42, poolSize: 44, engagement: 0.03, sources: 6 },
  { name: "Space Exploration", weight: 0.38, poolSize: 36, engagement: 0.09, sources: 5 },
  { name: "Formula 1", weight: 0.32, poolSize: 32, engagement: 0.11, sources: 5 },
  { name: "Startups", weight: 0.3, poolSize: 44, engagement: -0.03, sources: 6 },
  { name: "Health & Wellness", weight: 0.28, poolSize: 40, engagement: 0.02, sources: 6 },
  { name: "Cryptocurrency", weight: 0.2, poolSize: 32, engagement: -0.13, sources: 5 },
]

const TONES: { tone: Tone; weight: number; effect: number }[] = [
  { tone: "conversational", weight: 28, effect: 0.02 },
  { tone: "informative", weight: 24, effect: 0.03 },
  { tone: "storytelling", weight: 14, effect: 0.09 },
  { tone: "reassuring", weight: 8, effect: 0.03 },
  { tone: "journalistic", weight: 16, effect: -0.09 },
  { tone: "humorous", weight: 10, effect: 0.03 },
]
const TONE_EFFECT = Object.fromEntries(TONES.map((entry) => [entry.tone, entry.effect])) as Record<Tone, number>

const LANGUAGES = [
  { code: "en", weight: 62 },
  { code: "es", weight: 16 },
  { code: "fr", weight: 7 },
  { code: "de", weight: 6 },
  { code: "pt", weight: 5 },
  { code: "ja", weight: 2 },
  { code: "it", weight: 2 },
]

const DURATIONS_MINUTES = [
  { value: 5, weight: 8 },
  { value: 8, weight: 10 },
  { value: 10, weight: 30 },
  { value: 15, weight: 22 },
  { value: 20, weight: 14 },
  { value: 25, weight: 6 },
  { value: 30, weight: 6 },
  { value: 45, weight: 4 },
]

type Archetype = "dormant" | "trial" | "casual" | "regular" | "power"

/** Chance per day that a user generates an episode. Trial users are handled separately (they fade out quickly). */
const DAILY_PROBABILITY: Record<Exclude<Archetype, "trial">, number> = {
  dormant: 0.002,
  casual: 0.04,
  regular: 0.12,
  power: 0.35,
}
const START_PROBABILITY: Record<Archetype, number> = { dormant: 0.5, trial: 0.6, casual: 0.68, regular: 0.8, power: 0.9 }
const ARCHETYPE_QUALITY: Record<Archetype, number> = { dormant: -0.02, trial: -0.06, casual: -0.02, regular: 0.03, power: 0.08 }

const LEGACY_MIX: [Archetype, number][] = [["dormant", 60], ["casual", 22], ["regular", 14], ["power", 4]]
const NEW_USER_MIX: [Archetype, number][] = [["trial", 55], ["casual", 22], ["regular", 17], ["power", 6]]

/** Where failures happen, and how often. */
const FAILURE_STAGE_WEIGHTS: [AnalyticsStage, number][] = [
  ["research", 30],
  ["audio", 25],
  ["writing", 15],
  ["validation", 15],
  ["planning", 7],
  ["ranking", 5],
  ["news-discovery", 3],
]

const WEEKDAY_FACTOR = [0.8, 1.15, 1.1, 1.05, 1, 0.9, 0.75] // Sunday first, like Date#getUTCDay
const HOUR_WEIGHTS = [1, 1, 1, 1, 2, 5, 9, 12, 10, 6, 4, 4, 6, 5, 4, 4, 4, 5, 6, 7, 7, 5, 3, 2]

/** Share of story picks that go to the day's hot stories (the rest is a personal long-tail pick). */
const HOT_STORY_SHARE = 0.45
const HOT_STORY_EXPONENT = 0.9

const RESEARCH_INDEX = ANALYTICS_STAGES.indexOf("research")

interface SimUser {
  user: MockUser
  archetype: Archetype
  createdMs: number
}

interface AttemptEvent {
  simUser: SimUser
  timeMs: number
}

interface StoryPick {
  key: string
  topicIndex: number
}

interface StoryRecord {
  story: MockResearchStory
  users: Set<string>
}

interface UsageCell {
  requests: number
  cost: number
  latencySum: number
}

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

const round = (value: number, digits: number) => {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const startOfDayMs = (ms: number) => Math.floor(ms / DAY_MS) * DAY_MS

/** `endDate` is the last day covered (YYYY-MM-DD, UTC); the dataset holds `days` days ending on it. */
export function generateMockAnalytics(endDate: string, days: number = ANALYTICS_DAYS): AnalyticsData {
  const random = mulberry32(SEED)
  const normal = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random())
  const between = (min: number, max: number) => min + random() * (max - min)
  const integer = (maxExclusive: number) => Math.floor(random() * maxExclusive)
  const weighted = <T>(entries: readonly (readonly [T, number])[]): T => {
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0)
    let cursor = random() * total
    for (const [value, weight] of entries) {
      cursor -= weight
      if (cursor < 0) return value
    }
    return entries[entries.length - 1][0]
  }
  const toneEntries = TONES.map((entry) => [entry.tone, entry.weight] as const)
  const languageEntries = LANGUAGES.map((entry) => [entry.code, entry.weight] as const)
  const durationEntries = DURATIONS_MINUTES.map((entry) => [entry.value, entry.weight] as const)
  const hourEntries = HOUR_WEIGHTS.map((weight, hour) => [hour, weight] as const)

  const endMs = Date.parse(`${endDate}T00:00:00Z`)
  const startMs = endMs - (days - 1) * DAY_MS
  const endExclusiveMs = endMs + DAY_MS

  // Cumulative Zipf weights per interest, so a "hot" story pick is a binary search away.
  const hotCdf = INTERESTS.map((interest) => {
    let sum = 0
    return Array.from({ length: interest.poolSize }, (_, rank) => (sum += 1 / (rank + 1) ** HOT_STORY_EXPONENT))
  })
  const pickHotRank = (topicIndex: number) => {
    const cdf = hotCdf[topicIndex]
    const target = random() * cdf[cdf.length - 1]
    let low = 0
    let high = cdf.length - 1
    while (low < high) {
      const mid = (low + high) >> 1
      if (cdf[mid] < target) low = mid + 1
      else high = mid
    }
    return low
  }

  const users: SimUser[] = []
  const episodes: MockEpisode[] = []
  const sessions: MockListeningSession[] = []
  const feedback: MockFeedback[] = []
  const stories = new Map<string, StoryRecord>()
  const usage = new Map<string, UsageCell>()

  const addUsage = (timeMs: number, provider: ApiProvider, stage: AnalyticsStage, requests: number, cost: number, latency: number) => {
    const key = `${dayKey(timeMs)}|${provider}|${stage}`
    const cell = usage.get(key) ?? { requests: 0, cost: 0, latencySum: 0 }
    cell.requests += requests
    cell.cost += cost
    cell.latencySum += latency * requests
    usage.set(key, cell)
  }

  const createUser = (createdMs: number, mix: [Archetype, number][]) => {
    const interestCount = weighted<number>([[2, 35], [3, 40], [4, 25]])
    const interests: string[] = []
    while (interests.length < interestCount) {
      interests.push(weighted(INTERESTS.filter((interest) => !interests.includes(interest.name)).map((interest) => [interest.name, interest.weight] as const)))
    }
    const user: MockUser = {
      id: `u-${users.length + 1}`,
      createdAt: new Date(createdMs).toISOString(),
      language: weighted(languageEntries),
      interests,
      tone: weighted(toneEntries),
      preferredDurationMinutes: weighted(durationEntries),
    }
    const simUser: SimUser = { user, archetype: weighted(mix), createdMs }
    users.push(simUser)
    return simUser
  }

  /** Researches a story at its first use, booking the cost once. Later uses reuse it. */
  const useStory = (pick: StoryPick, timeMs: number, speed: number) => {
    const existing = stories.get(pick.key)
    if (existing) return { record: existing, isNew: false }
    const profile = INTERESTS[pick.topicIndex]
    const sourceCount = clamp(Math.round(profile.sources + normal() * 1.5), 3, 12)
    const tavilyRequests = 2 + Math.round(sourceCount / 4)
    const tavilyCost = round(tavilyRequests * 0.0105, 5)
    const openaiCost = round(0.012 + 0.0025 * sourceCount, 5)
    const record: StoryRecord = {
      story: {
        storyId: `story-${pick.key.replaceAll(":", "-")}`,
        topic: profile.name,
        researchedAt: new Date(timeMs).toISOString(),
        usersServed: 0,
        sourceCount,
        researchCost: tavilyCost + openaiCost,
      },
      users: new Set(),
    }
    stories.set(pick.key, record)
    addUsage(timeMs, "tavily", "research", tavilyRequests, tavilyCost, between(2.5, 5) * speed)
    addUsage(timeMs, "openai", "research", 1, openaiCost, between(4, 8) * speed)
    return { record, isNew: true }
  }

  /** Runs one generation attempt and returns the attempts it triggers (a retry after a failure, a regeneration). */
  const runAttempt = (simUser: SimUser, timeMs: number, dayIndex: number, progress: number): AttemptEvent[] => {
    const { user } = simUser
    const minutes = random() < 0.8 ? user.preferredDurationMinutes : weighted(durationEntries)
    const tone = random() < 0.15 ? weighted(toneEntries) : user.tone
    const speed = 1.07 - 0.14 * progress // the pipeline gets a little faster as it is tuned

    const failedStage = random() < 0.055 - 0.025 * progress ? weighted(FAILURE_STAGE_WEIGHTS) : undefined
    const failedIndex = failedStage ? ANALYTICS_STAGES.indexOf(failedStage) : Infinity
    const runs = (stage: AnalyticsStage) => ANALYTICS_STAGES.indexOf(stage) <= failedIndex

    const stageLatency: Partial<Record<AnalyticsStage, number>> = {}
    const setLatency = (stage: AnalyticsStage, seconds: number) => {
      // The failing stage gives up part-way (or times out a little late).
      stageLatency[stage] = round(stage === failedStage ? seconds * between(0.5, 1.3) : seconds, 2)
    }
    /** Records a stage's latency and its API usage. A failing stage is billed for half. */
    const runStage = (stage: AnalyticsStage, provider: ApiProvider, seconds: number, cost: number, requests: number) => {
      setLatency(stage, seconds)
      if (requests > 0) addUsage(timeMs, provider, stage, requests, stage === failedStage ? cost * 0.5 : cost, stageLatency[stage]! / requests)
    }

    // Discovery reads the shared news pool; only a cache miss calls GNews.
    const miss = random() < 0.25
    runStage("news-discovery", "gnews", (miss ? between(2.6, 3.8) : between(0.5, 0.8)) * speed, miss ? 0.004 : 0, miss ? 1 : 0)
    // Ranking is personal: it picks this user's stories from the shared pool.
    if (runs("ranking")) runStage("ranking", "openai", between(3, 6) * speed, between(0.01, 0.016), 1)

    const picks: StoryPick[] = []
    if (failedIndex > RESEARCH_INDEX) {
      const target = Math.max(2, Math.min(9, Math.round(minutes / 2.4 + normal() * 0.7)))
      const seen = new Set<string>()
      for (let tries = 0; picks.length < target && tries < target * 8; tries++) {
        const topic = user.interests[integer(user.interests.length)]
        const topicIndex = INTERESTS.findIndex((interest) => interest.name === topic)
        const poolDay = dayIndex > 0 && random() < 0.25 ? dayIndex - 1 : dayIndex
        const rank = random() < HOT_STORY_SHARE ? pickHotRank(topicIndex) : integer(INTERESTS[topicIndex].poolSize)
        const key = `${poolDay}:${topicIndex}:${rank}`
        if (!seen.has(key)) {
          seen.add(key)
          picks.push({ key, topicIndex })
        }
      }
    }
    const used = picks.map((pick) => useStory(pick, timeMs, speed))
    const newStories = used.filter((entry) => entry.isNew).length
    if (runs("research")) {
      const seconds = failedStage === "research" ? between(15, 30) : 2.5 + (newStories > 0 ? 9 + 2.6 * newStories + normal() * 3 : 0)
      setLatency("research", Math.max(1.5, seconds) * speed)
    }

    if (runs("planning")) runStage("planning", "openai", between(4.5, 8) * speed, between(0.007, 0.012), 1)
    if (runs("writing")) {
      const retried = random() < 0.12 // the Writer's one retry after a failed validation
      runStage("writing", "openai", (7 + 1.9 * minutes + normal() * 3) * speed * (retried ? 1.9 : 1), (0.006 + 0.003 * minutes) * (retried ? 2 : 1), retried ? 2 : 1)
    }
    if (runs("validation")) runStage("validation", "openai", (4 + 0.5 * minutes + between(0, 2.5)) * speed, 0.012 + 0.0009 * minutes + between(0, 0.004), 1)
    if (runs("audio")) runStage("audio", "elevenlabs", (9 + 3.2 * minutes + normal() * 4) * speed, 0.009 * minutes * between(0.97, 1.03), Math.ceil(minutes / 10))

    const totalSeconds = round(Object.values(stageLatency).reduce((sum, seconds) => sum + seconds, 0), 2)
    const finishedMs = timeMs + totalSeconds * 1000
    const topics = [...new Set(picks.map((pick) => INTERESTS[pick.topicIndex].name))]
    const episode: MockEpisode = {
      id: `ep-${episodes.length + 1}`,
      userId: user.id,
      createdAt: new Date(timeMs).toISOString(),
      durationSeconds: minutes * 60,
      language: user.language,
      tone,
      interests: topics.length > 0 ? topics : user.interests,
      status: failedStage ? "failed" : "success",
      ...(failedStage ? { failedStage } : {}),
      generationLatencySeconds: totalSeconds,
      stageLatencySeconds: stageLatency,
      storiesCount: picks.length,
      storyIds: used.map((entry) => entry.record.story.storyId),
    }
    episodes.push(episode)

    if (failedStage) {
      // Most people try again straight away.
      return random() < 0.75 ? [{ simUser, timeMs: finishedMs + between(1, 8) * MINUTE_MS }] : []
    }
    for (const entry of used) entry.record.users.add(user.id)

    // How good the episode was for this listener drives whether they finish it, rate it and generate another.
    const interestEffect = picks.length > 0 ? picks.reduce((sum, pick) => sum + INTERESTS[pick.topicIndex].engagement, 0) / picks.length : 0
    const quality = TONE_EFFECT[tone] + interestEffect - 0.004 * (minutes - 10) + ARCHETYPE_QUALITY[simUser.archetype] + 0.06 * progress + normal() * 0.08

    let started = false
    let completed = false
    let disliked = false
    if (random() < clamp(START_PROBABILITY[simUser.archetype] + 0.4 * quality, 0.2, 0.97)) {
      const delay = random() < 0.85 ? -Math.log(1 - random()) * 2.5 * HOUR_MS : between(12, 40) * HOUR_MS
      const startedMs = finishedMs + delay
      if (startedMs < endExclusiveMs) {
        started = true
        const fraction = random() < clamp(0.66 + quality, 0.1, 0.95) ? 0.82 + 0.18 * random() : 0.75 * random() ** 1.2
        const listenedSeconds = Math.round(fraction * episode.durationSeconds)
        completed = listenedSeconds >= 0.8 * episode.durationSeconds
        sessions.push({ episodeId: episode.id, userId: user.id, startedAt: new Date(startedMs).toISOString(), listenedSeconds, completed })
        if (random() < (completed ? 0.26 : 0.09)) {
          disliked = random() >= clamp(0.74 + 0.8 * quality - (completed ? 0 : 0.1), 0.25, 0.97)
          feedback.push({ episodeId: episode.id, userId: user.id, type: disliked ? "dislike" : "like" })
        }
      }
    }

    // Generating again soon after is a weak sign of friction, and much likelier after a dislike.
    const regenerate = 0.025 + (disliked ? 0.25 : 0) + (started && !completed ? 0.04 : 0) + (started ? 0 : 0.02)
    if (random() < regenerate) {
      return [{ simUser, timeMs: finishedMs + (random() < 0.8 ? between(3, 90) * MINUTE_MS : between(2, 23) * HOUR_MS) }]
    }
    return []
  }

  for (let i = 0; i < LEGACY_USERS; i++) createUser(startMs - 1 - Math.floor(random() * LEGACY_SPAN_DAYS * DAY_MS), LEGACY_MIX)

  let carried: AttemptEvent[] = []
  for (let dayIndex = 0; dayIndex < days; dayIndex++) {
    const dayStartMs = startMs + dayIndex * DAY_MS
    const dayEndMs = dayStartMs + DAY_MS
    const progress = dayIndex / Math.max(1, days - 1)
    const weekday = new Date(dayStartMs).getUTCDay()

    // Sign-ups grow through the period, with a weekly rhythm.
    const signups = Math.max(0, Math.round((4 + 2.2 * progress) * WEEKDAY_FACTOR[weekday] + normal() * 1.2))
    const newcomers: SimUser[] = []
    for (let i = 0; i < signups; i++) newcomers.push(createUser(dayStartMs + Math.floor(random() * DAY_MS), NEW_USER_MIX))

    // Engagement improves a little over time, with a weekly rhythm and a slow wave on top.
    const dayFactor = (1 + 0.2 * progress) * WEEKDAY_FACTOR[weekday] * (1 + 0.07 * Math.sin(dayIndex / 9)) * (1 + normal() * 0.05)

    // The day's attempts, kept in time order. It grows while it is walked, as attempts trigger later ones.
    const queue = carried
    carried = []
    const schedule = (event: AttemptEvent) => {
      if (event.timeMs >= endExclusiveMs) return
      if (event.timeMs >= dayEndMs) {
        carried.push(event)
        return
      }
      let low = 0
      let high = queue.length
      while (low < high) {
        const mid = (low + high) >> 1
        if (queue[mid].timeMs <= event.timeMs) low = mid + 1
        else high = mid
      }
      queue.splice(low, 0, event)
    }

    for (const simUser of users) {
      if (simUser.createdMs >= dayStartMs) continue // signed up today: handled below
      const ageDays = Math.floor((dayStartMs - startOfDayMs(simUser.createdMs)) / DAY_MS)
      const base = simUser.archetype === "trial" ? Math.max(0.002, 0.14 * 0.55 ** ageDays) : DAILY_PROBABILITY[simUser.archetype]
      if (random() < Math.min(0.95, base * dayFactor)) {
        schedule({ simUser, timeMs: dayStartMs + weighted(hourEntries) * HOUR_MS + Math.floor(random() * HOUR_MS) })
      }
    }
    for (const simUser of newcomers) {
      if (random() < 0.8) schedule({ simUser, timeMs: simUser.createdMs + Math.floor(between(2, 40) * MINUTE_MS) })
    }

    // In time order, so a story is researched at its first use and reused after that.
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const { simUser, timeMs } = queue[cursor]
      for (const followUp of runAttempt(simUser, timeMs, dayIndex, progress)) schedule(followUp)
    }
  }

  const researchStories = [...stories.values()].map(({ story, users: served }) => ({ ...story, usersServed: served.size }))
  const apiUsage: MockApiUsage[] = [...usage.entries()]
    .map(([key, cell]) => {
      const [day, provider, stage] = key.split("|") as [string, ApiProvider, AnalyticsStage]
      return { timestamp: `${day}T00:00:00.000Z`, provider, stage, requests: cell.requests, cost: cell.cost, latency: round(cell.latencySum / cell.requests, 2) }
    })
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  sessions.sort((a, b) => a.startedAt.localeCompare(b.startedAt))

  return {
    users: users.map((simUser) => simUser.user),
    episodes,
    sessions,
    feedback,
    researchStories,
    apiUsage,
    coverage: { startDate: dayKey(startMs), endDate },
  }
}
