import { RateSplitCard, StatCard } from "@/components/dashboard/StatCard"
import { describeChange, formatCount, formatEuro, formatPercent } from "@/lib/analytics/format"
import type { DashboardMetrics } from "@/types"

interface OverviewSectionProps {
  metrics: DashboardMetrics
}

/** The seven top-level KPIs: how many people use ProsperPod, how much they generate, how well it lands, and what it costs. */
export function OverviewSection({ metrics }: OverviewSectionProps) {
  const { overview, economics, range } = metrics
  const perDay = overview.episodesGenerated.value / range.days

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
      <StatCard
        label="Weekly active users"
        value={formatCount(overview.weeklyActiveUsers.value)}
        detail="Generated or listened, last 7 days"
        change={describeChange(overview.weeklyActiveUsers.value, overview.weeklyActiveUsers.previous, "relative")}
      />
      <StatCard
        label="Monthly active users"
        value={formatCount(overview.monthlyActiveUsers.value)}
        detail="Generated or listened, last 30 days"
        change={describeChange(overview.monthlyActiveUsers.value, overview.monthlyActiveUsers.previous, "relative")}
      />
      <StatCard
        label="7-day retention"
        value={formatPercent(overview.retention7d.value)}
        detail={`${formatCount(overview.retention7dCohort)} new users`}
        change={describeChange(overview.retention7d.value, overview.retention7d.previous, "points")}
      />
      <StatCard
        label="Podcasts generated"
        value={formatCount(overview.episodesGenerated.value)}
        detail={`About ${formatCount(perDay)} a day`}
        change={describeChange(overview.episodesGenerated.value, overview.episodesGenerated.previous, "relative")}
      />
      <StatCard
        label="Completion rate"
        value={formatPercent(overview.completionRate.value)}
        detail={`${formatCount(overview.startedEpisodes)} podcasts started`}
        change={describeChange(overview.completionRate.value, overview.completionRate.previous, "points")}
      />
      <RateSplitCard
        label="Like / dislike rate"
        likeShare={overview.likeRate.value}
        likeValue={formatPercent(overview.likeRate.value)}
        dislikeValue={formatPercent(overview.dislikeRate.value)}
      />
      <StatCard
        label="Total API cost"
        value={formatEuro(economics.totalCost.value)}
        detail="All providers, including failed attempts"
        change={describeChange(economics.totalCost.value, economics.totalCost.previous, "relative", "down")}
      />
    </div>
  )
}
