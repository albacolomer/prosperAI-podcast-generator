import { ChartCard } from "@/components/dashboard/ChartCard"
import { CHART_COLORS } from "@/components/dashboard/chartColors"
import { StatCard } from "@/components/dashboard/StatCard"
import { TrendChart } from "@/components/dashboard/TrendChart"
import { describeChange, formatPercent } from "@/lib/analytics/format"
import type { DashboardMetrics } from "@/types"

interface QualitySectionProps {
  metrics: DashboardMetrics
}

export function QualitySection({ metrics }: QualitySectionProps) {
  const { quality, range } = metrics
  const completionCadence = range.days > 30 ? "Weekly" : "Daily"
  const likeCadence = range.days > 7 ? "Weekly" : "Daily"

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Completion rate" description={`${completionCadence}: started episodes listened to at least 80%.`}>
          <TrendChart
            data={quality.completionTrend}
            seriesLabel="Completion rate"
            color={CHART_COLORS.quality}
            formatValue={(value) => formatPercent(value)}
            formatTick={(value) => formatPercent(value, 0)}
            variant="line"
            rate
          />
        </ChartCard>
        <ChartCard title="Like rate" description={`${likeCadence}: likes out of rated episodes only.`}>
          <TrendChart
            data={quality.likeTrend}
            seriesLabel="Like rate"
            color={CHART_COLORS.quality}
            formatValue={(value) => formatPercent(value)}
            formatTick={(value) => formatPercent(value, 0)}
            variant="line"
            rate
          />
        </ChartCard>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Average listen-through"
          value={formatPercent(quality.averageListenThrough.value)}
          detail="Share of each started episode that was played"
          change={describeChange(quality.averageListenThrough.value, quality.averageListenThrough.previous, "points")}
        />
        <StatCard
          label="Rating rate"
          value={formatPercent(quality.ratingRate.value)}
          detail="Generated episodes that got a like or dislike"
          change={describeChange(quality.ratingRate.value, quality.ratingRate.previous, "points")}
        />
        <StatCard
          label="Regeneration rate"
          value={formatPercent(quality.regenerationRate.value)}
          detail="Episodes followed by another generation within 24 hours"
          change={describeChange(quality.regenerationRate.value, quality.regenerationRate.previous, "points", "down")}
          note="Proxy for potential dissatisfaction, not confirmed dislike."
        />
      </div>
    </div>
  )
}
