import { StatCard } from "@/components/dashboard/StatCard"
import { describeChange, formatCount, formatPercent } from "@/lib/analytics/format"
import type { DashboardMetrics } from "@/types"

interface OverviewSectionProps {
  metrics: DashboardMetrics
}

export function OverviewSection({ metrics }: OverviewSectionProps) {
  const { overview, range } = metrics
  const perDay = overview.episodesGenerated.value / range.days

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <StatCard
        label="Total users"
        value={formatCount(overview.totalUsers.value)}
        detail="Registered"
        change={describeChange(overview.totalUsers.value, overview.totalUsers.previous, "relative")}
      />
      <StatCard
        label="Active users"
        value={formatCount(overview.activeUsers.value)}
        detail={`${formatPercent(overview.activeShare, 0)} of all users`}
        change={describeChange(overview.activeUsers.value, overview.activeUsers.previous, "relative")}
      />
      <StatCard
        label="Episodes generated"
        value={formatCount(overview.episodesGenerated.value)}
        detail={`About ${formatCount(perDay)} a day`}
        change={describeChange(overview.episodesGenerated.value, overview.episodesGenerated.previous, "relative")}
      />
      <StatCard
        label="Completion rate"
        value={formatPercent(overview.completionRate.value)}
        detail={`${formatCount(overview.startedEpisodes)} episodes started`}
        change={describeChange(overview.completionRate.value, overview.completionRate.previous, "points")}
      />
      <StatCard
        label="Like rate"
        value={formatPercent(overview.likeRate.value)}
        detail={`${formatCount(overview.ratingsCount)} ratings`}
        change={describeChange(overview.likeRate.value, overview.likeRate.previous, "points")}
      />
      <StatCard
        label="7-day retention"
        value={formatPercent(overview.retention7d.value)}
        detail={`${formatCount(overview.retention7dCohort)} new users`}
        change={describeChange(overview.retention7d.value, overview.retention7d.previous, "points")}
      />
    </div>
  )
}
