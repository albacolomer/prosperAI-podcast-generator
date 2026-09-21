import { useMemo, useState, type ReactNode } from "react"
import { ContentSection } from "@/components/dashboard/ContentSection"
import { DashboardFilters } from "@/components/dashboard/DashboardFilters"
import { EconomicsSection } from "@/components/dashboard/EconomicsSection"
import { OverviewSection } from "@/components/dashboard/OverviewSection"
import { PersonalizationSection } from "@/components/dashboard/PersonalizationSection"
import { QualitySection } from "@/components/dashboard/QualitySection"
import { TechnologySection } from "@/components/dashboard/TechnologySection"
import { UsageSection } from "@/components/dashboard/UsageSection"
import { SectionHeading } from "@/components/shared/SectionHeading"
import { Badge } from "@/components/ui/badge"
import { getAnalyticsData } from "@/data/analytics/getAnalyticsData"
import { useDocumentTitle } from "@/hooks/useDocumentTitle"
import { formatDateRange } from "@/lib/analytics/format"
import { computeDashboardMetrics } from "@/lib/analytics/metrics"
import type { DashboardRange } from "@/types"

function DashboardSection({ title, question, children }: { title: string; question: string; children: ReactNode }) {
  return (
    <section className="flex flex-col">
      <SectionHeading title={title} subtitle={question} />
      {children}
    </section>
  )
}

export function DashboardPage() {
  useDocumentTitle("ProsperPod — Internal Dashboard")

  const [range, setRange] = useState<DashboardRange>(30)
  const metrics = useMemo(() => computeDashboardMetrics(getAnalyticsData(), range), [range])

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Internal</p>
            <Badge variant="outline" className="text-[10px] tracking-wide text-muted-foreground uppercase">
              Mock data
            </Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Product analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            For the ProsperPod team, not visible to end users. {formatDateRange(metrics.range.startDate, metrics.range.endDate)}, compared with the previous {range} days.
          </p>
        </div>
        <DashboardFilters value={range} onChange={setRange} />
      </div>

      <OverviewSection metrics={metrics} />

      <DashboardSection title="Product usage" question="Is ProsperPod being used?">
        <UsageSection metrics={metrics} />
      </DashboardSection>

      <DashboardSection title="Content & engagement" question="What do people listen to, and in which formats?">
        <ContentSection metrics={metrics} />
      </DashboardSection>

      <DashboardSection title="Quality" question="Are people listening to and enjoying the episodes?">
        <QualitySection metrics={metrics} />
      </DashboardSection>

      <DashboardSection title="Personalization" question="What is shared between users, and what is personal?">
        <PersonalizationSection metrics={metrics} />
      </DashboardSection>

      <DashboardSection title="Technology" question="Can the system scale, and where is the bottleneck?">
        <TechnologySection metrics={metrics} />
      </DashboardSection>

      <DashboardSection title="API & economics" question="What does an episode cost?">
        <EconomicsSection metrics={metrics} />
      </DashboardSection>
    </div>
  )
}
