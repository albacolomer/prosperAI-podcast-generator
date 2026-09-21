import type { AnalyticsData } from "@/types"
import { generateMockAnalytics } from "./generateMockAnalytics"

let cached: AnalyticsData | undefined

/** The last complete day, so the dashboard never shows a half-finished one. */
function yesterday(): string {
  return new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
}

/**
 * The dashboard's only data source. Today it is a deterministic mock; a real implementation returns the same
 * AnalyticsData shape (users, episodes, sessions, feedback, research stories, API usage) and nothing else changes,
 * because every metric is computed from these records in src/lib/analytics.
 */
export function getAnalyticsData(): AnalyticsData {
  cached ??= generateMockAnalytics(yesterday())
  return cached
}
