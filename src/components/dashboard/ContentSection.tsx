import { BarList, type BarRow } from "@/components/dashboard/BarList"
import { ChartCard } from "@/components/dashboard/ChartCard"
import { CHART_COLORS } from "@/components/dashboard/chartColors"
import { EngagementByInterestTable } from "@/components/dashboard/EngagementByInterestTable"
import { MiniStat } from "@/components/dashboard/StatCard"
import { describeChange, formatCount, formatMinutes, formatPercent } from "@/lib/analytics/format"
import type { DashboardMetrics, NamedValue } from "@/types"

interface ContentSectionProps {
  metrics: DashboardMetrics
}

/** Each row's share of the total, printed on the bar; the tooltip adds the episode count. */
function shareRows(values: NamedValue[]): BarRow[] {
  const total = values.reduce((sum, entry) => sum + entry.value, 0)
  return values.map((entry) => {
    const share = formatPercent(total > 0 ? entry.value / total : null, 0)
    return { name: entry.name, value: entry.value, label: share, detail: `${share} · ${formatCount(entry.value)} episodes` }
  })
}

/** "Conversational / Informal" -> "Conversational": the axis is narrow, the tooltip has the full name. */
const shortTone = (name: string) => name.split(" / ")[0]

export function ContentSection({ metrics }: ContentSectionProps) {
  const { content } = metrics

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Top interests" description="Episodes containing stories on each interest.">
          <BarList rows={content.topInterests} seriesLabel="Episodes" color={CHART_COLORS.volume} formatValue={formatCount} nameWidth={156} />
        </ChartCard>
        <ChartCard title="Engagement by interest" description="How people respond to each interest, not only how often they get it.">
          <EngagementByInterestTable rows={content.interestEngagement} />
        </ChartCard>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <ChartCard title="Languages" description="Share of episodes.">
          <BarList rows={shareRows(content.languages)} seriesLabel="Episodes" color={CHART_COLORS.volume} formatValue={formatCount} nameWidth={84} />
        </ChartCard>
        <ChartCard title="Tones" description="Share of episodes.">
          <BarList
            rows={shareRows(content.tones)}
            seriesLabel="Episodes"
            color={CHART_COLORS.volume}
            formatValue={formatCount}
            nameWidth={104}
            formatName={shortTone}
          />
        </ChartCard>
        <ChartCard title="Duration" description="Length of generated episodes." className="md:col-span-2 xl:col-span-1">
          <div className="flex flex-col gap-4">
            <MiniStat
              label="Average duration"
              value={formatMinutes(content.averageDurationMinutes.value)}
              change={describeChange(content.averageDurationMinutes.value, content.averageDurationMinutes.previous, "relative")}
            />
            <BarList rows={shareRows(content.durationBuckets)} seriesLabel="Episodes" color={CHART_COLORS.volume} formatValue={formatCount} nameWidth={84} />
          </div>
        </ChartCard>
      </div>

      <p className="text-xs text-muted-foreground">Voice analytics — coming later. Voice selection is currently disabled, so there is no voice data to show.</p>
    </div>
  )
}
