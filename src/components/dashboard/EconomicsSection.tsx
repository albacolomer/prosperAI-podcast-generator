import { BarList, type BarRow } from "@/components/dashboard/BarList"
import { ChartCard } from "@/components/dashboard/ChartCard"
import { CHART_COLORS } from "@/components/dashboard/chartColors"
import { StatCard } from "@/components/dashboard/StatCard"
import { describeChange, formatCount, formatEuro, formatPercent } from "@/lib/analytics/format"
import type { DashboardMetrics } from "@/types"

interface EconomicsSectionProps {
  metrics: DashboardMetrics
}

/** Cost and share of the total on the bar; requests, when known, are secondary and live in the tooltip. */
function costRows(entries: { label: string; value: number; requests?: number }[]): BarRow[] {
  const total = entries.reduce((sum, entry) => sum + entry.value, 0)
  return entries.map((entry) => {
    const share = formatPercent(total > 0 ? entry.value / total : null, 0)
    const requests = entry.requests === undefined ? "" : ` · ${formatCount(entry.requests)} requests`
    return { name: entry.label, value: entry.value, label: `${formatEuro(entry.value)} · ${share}`, detail: `${formatEuro(entry.value)} · ${share}${requests}` }
  })
}

export function EconomicsSection({ metrics }: EconomicsSectionProps) {
  const { economics: e } = metrics
  const requests = new Map(e.requestsByStage.map((stage) => [stage.stage, stage.value]))

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Total API cost"
          value={formatEuro(e.totalCost.value)}
          detail="All providers, including failed attempts"
          change={describeChange(e.totalCost.value, e.totalCost.previous, "relative", "down")}
        />
        <StatCard
          label="Cost per successful episode"
          value={formatEuro(e.costPerSuccessfulEpisode.value)}
          detail="Total API cost / successful episodes"
          change={describeChange(e.costPerSuccessfulEpisode.value, e.costPerSuccessfulEpisode.previous, "relative", "down")}
        />
        <StatCard
          label="Cost per active user"
          value={formatEuro(e.costPerActiveUser.value)}
          detail="Total API cost / active users"
          change={describeChange(e.costPerActiveUser.value, e.costPerActiveUser.previous, "relative", "down")}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Cost by provider" description="Share of the period's API cost.">
          <BarList
            rows={costRows(e.costByProvider)}
            seriesLabel="Cost"
            color={CHART_COLORS.effort}
            formatValue={formatEuro}
            nameWidth={92}
            labelWidth={92}
          />
        </ChartCard>
        <ChartCard title="Cost by pipeline stage" description="Hover a bar for the number of requests behind it.">
          <BarList
            rows={costRows(e.costByStage.map((stage) => ({ label: stage.label, value: stage.value, requests: requests.get(stage.stage) })))}
            seriesLabel="Cost"
            color={CHART_COLORS.effort}
            formatValue={formatEuro}
            nameWidth={128}
            labelWidth={92}
          />
        </ChartCard>
      </div>
    </div>
  )
}
