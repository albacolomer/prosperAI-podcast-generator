import { useMemo, useState } from "react"
import { ActiveUsersOverTimeChart } from "@/components/dashboard/ActiveUsersOverTimeChart"
import { CompletionRateChart } from "@/components/dashboard/CompletionRateChart"
import { DashboardFilters, type DashboardRange } from "@/components/dashboard/DashboardFilters"
import { EpisodesOverTimeChart } from "@/components/dashboard/EpisodesOverTimeChart"
import { LanguageDistributionChart } from "@/components/dashboard/LanguageDistributionChart"
import { RetentionChart } from "@/components/dashboard/RetentionChart"
import { ScheduleFrequencyChart } from "@/components/dashboard/ScheduleFrequencyChart"
import { StatCardGrid } from "@/components/dashboard/StatCardGrid"
import { TopInterestsChart } from "@/components/dashboard/TopInterestsChart"
import { VoicePopularityChart } from "@/components/dashboard/VoicePopularityChart"
import { SectionHeading } from "@/components/shared/SectionHeading"
import { mockDashboardMetrics } from "@/data/mockDashboardMetrics"
import { useDocumentTitle } from "@/hooks/useDocumentTitle"

export function DashboardPage() {
  useDocumentTitle("Echo — Internal Dashboard")

  const [range, setRange] = useState<DashboardRange>(30)

  const trends = useMemo(
    () => ({
      episodesOverTime: mockDashboardMetrics.episodesOverTime.slice(-range),
      activeUsersOverTime: mockDashboardMetrics.activeUsersOverTime.slice(-range),
      completionRateOverTime: mockDashboardMetrics.completionRateOverTime.slice(-range),
    }),
    [range],
  )

  return (
    <div className="flex flex-col gap-10">
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Internal</p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Product analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">Usage metrics for the Echo team, not visible to end users.</p>
      </div>

      <StatCardGrid kpis={mockDashboardMetrics.kpis} />

      <section className="flex flex-col gap-4">
        <SectionHeading
          title="Trends"
          subtitle="Rolling activity over the selected range."
          action={<DashboardFilters value={range} onChange={setRange} />}
        />
        <div className="grid gap-4 lg:grid-cols-3">
          <EpisodesOverTimeChart data={trends.episodesOverTime} />
          <ActiveUsersOverTimeChart data={trends.activeUsersOverTime} />
          <CompletionRateChart data={trends.completionRateOverTime} />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <SectionHeading title="Audience & content breakdown" subtitle="Lifetime totals across all users." />
        <div className="grid gap-4 md:grid-cols-2">
          <TopInterestsChart data={mockDashboardMetrics.topInterests} />
          <VoicePopularityChart data={mockDashboardMetrics.voicePopularity} />
          <LanguageDistributionChart data={mockDashboardMetrics.languageDistribution} />
          <ScheduleFrequencyChart data={mockDashboardMetrics.scheduleFrequencyDistribution} />
          <RetentionChart data={mockDashboardMetrics.retentionByWeek} />
        </div>
      </section>
    </div>
  )
}
