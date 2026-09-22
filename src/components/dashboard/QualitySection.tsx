import { useState } from "react"
import { ChartCard } from "@/components/dashboard/ChartCard"
import { CHART_COLORS } from "@/components/dashboard/chartColors"
import { StatCard } from "@/components/dashboard/StatCard"
import { TrendChart } from "@/components/dashboard/TrendChart"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { describeChange, formatPercent } from "@/lib/analytics/format"
import type { DashboardMetrics } from "@/types"

interface QualitySectionProps {
  metrics: DashboardMetrics
}

type FeedbackKind = "like" | "dislike"

export function QualitySection({ metrics }: QualitySectionProps) {
  const { quality, range } = metrics
  const completionCadence = range.days > 30 ? "Weekly" : "Daily"
  const likeCadence = range.days > 7 ? "Weekly" : "Daily"
  const [feedbackKind, setFeedbackKind] = useState<FeedbackKind>("like")
  const feedbackTrend = feedbackKind === "like" ? quality.likeTrend : quality.dislikeTrend

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Completion rate" description={`${completionCadence}: started podcasts listened to at least 80%.`}>
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
        <ChartCard
          title={
            <span className="flex items-center gap-2">
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={feedbackKind}
                aria-label="Like or dislike rate"
                onValueChange={(next) => {
                  if (next) setFeedbackKind(next as FeedbackKind)
                }}
              >
                <ToggleGroupItem value="like">Like</ToggleGroupItem>
                <ToggleGroupItem value="dislike">Dislike</ToggleGroupItem>
              </ToggleGroup>
              <span>rate</span>
            </span>
          }
          description={`${likeCadence}: ${feedbackKind === "like" ? "likes" : "dislikes"} out of rated podcasts only.`}
        >
          <TrendChart
            data={feedbackTrend}
            seriesLabel={feedbackKind === "like" ? "Like rate" : "Dislike rate"}
            color={feedbackKind === "like" ? CHART_COLORS.quality : CHART_COLORS.failure}
            formatValue={(value) => formatPercent(value)}
            formatTick={(value) => formatPercent(value, 0)}
            variant="line"
            rate
          />
        </ChartCard>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard
          label="Average listen-through"
          value={formatPercent(quality.averageListenThrough.value)}
          detail="Share of each started podcast that was played"
          change={describeChange(quality.averageListenThrough.value, quality.averageListenThrough.previous, "points")}
        />
        <StatCard
          label="Rating rate"
          value={formatPercent(quality.ratingRate.value)}
          detail="Generated podcasts that got a like or dislike"
          change={describeChange(quality.ratingRate.value, quality.ratingRate.previous, "points")}
        />
      </div>
    </div>
  )
}
