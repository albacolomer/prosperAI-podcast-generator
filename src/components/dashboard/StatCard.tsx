import { TrendingDown, TrendingUp } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { formatDelta, formatKpiValue } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { KpiStat } from "@/types"

interface StatCardProps {
  stat: KpiStat
}

export function StatCard({ stat }: StatCardProps) {
  const isGood = stat.deltaDirection === "up"
  const isFlat = stat.deltaDirection === "flat"

  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-1.5">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{stat.label}</p>
        <p className="text-2xl font-semibold tracking-tight text-foreground">
          {formatKpiValue(stat.value, stat.format)}
        </p>
        {isFlat ? null : (
          <div
            className={cn(
              "flex items-center gap-1 text-xs font-medium",
              isGood ? "text-status-good" : "text-status-bad",
            )}
          >
            {isGood ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
            <span>{formatDelta(stat.delta)}</span>
            <span className="font-normal text-muted-foreground">vs last period</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
