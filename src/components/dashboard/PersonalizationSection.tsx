import { MiniStat } from "@/components/dashboard/StatCard"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { describeChange, formatCount, formatDecimal, formatPercent } from "@/lib/analytics/format"
import type { DashboardMetrics } from "@/types"

interface PersonalizationSectionProps {
  metrics: DashboardMetrics
}

export function PersonalizationSection({ metrics }: PersonalizationSectionProps) {
  const { personalization: p } = metrics
  const reuseChange = describeChange(p.researchReuseRate.value, p.researchReuseRate.previous, "points")

  return (
    <Card>
      <CardHeader>
        <CardTitle>Research reuse</CardTitle>
        <CardDescription>Researched stories that served more than one user. Each reuse is research that did not have to be paid for again.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <span className="text-3xl font-semibold tracking-tight text-foreground tabular-nums">{formatPercent(p.researchReuseRate.value)}</span>
            <span className="text-sm text-muted-foreground">research reuse rate</span>
            {reuseChange ? <span className="text-xs text-muted-foreground">{reuseChange.text} vs previous period</span> : null}
          </div>
          <Progress value={(p.researchReuseRate.value ?? 0) * 100} aria-label="Research reuse rate" className="h-2" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <MiniStat label="Researched stories" value={formatCount(p.researchedStories)} />
          <MiniStat label="Reused stories" value={formatCount(p.reusedStories)} detail="Used by 2+ users" />
          <MiniStat
            label="Users per story"
            value={formatDecimal(p.averageUsersServed.value)}
            detail="Average users served"
            change={describeChange(p.averageUsersServed.value, p.averageUsersServed.previous, "relative")}
          />
        </div>
      </CardContent>
    </Card>
  )
}
