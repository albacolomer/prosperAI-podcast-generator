import { BarList } from "@/components/dashboard/BarList"
import { ChartCard } from "@/components/dashboard/ChartCard"
import { CHART_COLORS } from "@/components/dashboard/chartColors"
import { StatCard } from "@/components/dashboard/StatCard"
import { describeChange, formatCount, formatDecimal, formatPercent, formatSeconds } from "@/lib/analytics/format"
import type { DashboardMetrics } from "@/types"

interface TechnologySectionProps {
  metrics: DashboardMetrics
}

export function TechnologySection({ metrics }: TechnologySectionProps) {
  const { technology: t } = metrics
  const attempts = t.successfulAttempts + t.failedAttempts

  const stageTotal = t.latencyByStage.reduce((sum, stage) => sum + stage.value, 0)
  const slowest = t.latencyByStage.reduce((max, stage) => (stage.value > max.value ? stage : max), t.latencyByStage[0])
  const bottleneck = stageTotal > 0 ? `Slowest stage: ${slowest.label}, ${formatPercent(slowest.value / stageTotal, 0)} of the total.` : null

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Avg generation latency"
          value={formatSeconds(t.averageLatencySeconds.value)}
          detail="Start to audio ready"
          change={describeChange(t.averageLatencySeconds.value, t.averageLatencySeconds.previous, "relative", "down")}
        />
        <StatCard
          label="Success rate"
          value={formatPercent(t.successRate.value)}
          detail={`${formatCount(t.failedAttempts)} failed of ${formatCount(attempts)} attempts`}
          change={describeChange(t.successRate.value, t.successRate.previous, "points")}
        />
        <StatCard
          label="Stories per podcast"
          value={formatDecimal(t.averageStoriesPerEpisode.value)}
          detail="Average"
          change={describeChange(t.averageStoriesPerEpisode.value, t.averageStoriesPerEpisode.previous, "relative")}
        />
        <StatCard
          label="Sources per story"
          value={formatDecimal(t.averageSourcesPerStory.value)}
          detail="Average research sources"
          change={describeChange(t.averageSourcesPerStory.value, t.averageSourcesPerStory.previous, "relative")}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Latency by pipeline stage" description={bottleneck ?? "Average seconds per stage."}>
          <BarList
            rows={t.latencyByStage.map((stage) => ({ name: stage.label, value: stage.value }))}
            seriesLabel="Average latency"
            color={CHART_COLORS.effort}
            formatValue={formatSeconds}
            nameWidth={128}
          />
        </ChartCard>
        <ChartCard
          title="Failures by stage"
          description={`${formatCount(t.failedAttempts)} failed attempts in the period, by the stage that failed.`}
        >
          <BarList
            rows={t.failuresByStage.map((stage) => ({ name: stage.label, value: stage.value }))}
            seriesLabel="Failed attempts"
            color={CHART_COLORS.failure}
            formatValue={formatCount}
            nameWidth={128}
          />
        </ChartCard>
      </div>
    </div>
  )
}
