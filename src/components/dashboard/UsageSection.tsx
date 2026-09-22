import { ChartCard } from "@/components/dashboard/ChartCard"
import { CHART_COLORS } from "@/components/dashboard/chartColors"
import { MiniStat, StatCard } from "@/components/dashboard/StatCard"
import { TrendChart } from "@/components/dashboard/TrendChart"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { describeChange, formatCount, formatDecimal, formatPercent } from "@/lib/analytics/format"
import type { DashboardMetrics } from "@/types"

interface UsageSectionProps {
  metrics: DashboardMetrics
}

export function UsageSection({ metrics }: UsageSectionProps) {
  const { overview, usage } = metrics

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <ChartCard title="Podcasts generated" description="Successfully generated podcasts per day." className="lg:col-span-2">
        <TrendChart data={usage.episodesOverTime} seriesLabel="Podcasts generated" color={CHART_COLORS.volume} formatValue={formatCount} />
      </ChartCard>

      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <StatCard
            label="Active users"
            value={formatCount(overview.activeUsers.value)}
            detail={`${formatPercent(overview.activeShare, 0)} of all users`}
            change={describeChange(overview.activeUsers.value, overview.activeUsers.previous, "relative")}
          />
          <StatCard
            label="Podcasts per active user"
            value={formatDecimal(usage.episodesPerActiveUser.value)}
            detail="Generated / active users"
            change={describeChange(usage.episodesPerActiveUser.value, usage.episodesPerActiveUser.previous, "relative")}
          />
        </div>
        <Card className="flex-1">
          <CardHeader>
            <CardTitle>Retention</CardTitle>
            <CardDescription>New users who came back to generate or listen.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <MiniStat
              label="Within 7 days"
              value={formatPercent(usage.retention7d.value)}
              detail={`${formatCount(usage.retention7dCohort)} users`}
              change={describeChange(usage.retention7d.value, usage.retention7d.previous, "points")}
            />
            <MiniStat
              label="Within 30 days"
              value={formatPercent(usage.retention30d.value)}
              detail={`${formatCount(usage.retention30dCohort)} users`}
              change={describeChange(usage.retention30d.value, usage.retention30d.previous, "points")}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
