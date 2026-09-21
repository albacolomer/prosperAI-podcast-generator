import { formatCount, formatPercent } from "@/lib/analytics/format"
import type { InterestEngagement } from "@/types"

function RateCell({ rate, detail }: { rate: number | null; detail?: string }) {
  return (
    <div className="flex min-w-24 flex-col gap-1">
      <span className="tabular-nums">
        {formatPercent(rate)}
        {detail ? <span className="ml-1.5 text-xs text-muted-foreground">{detail}</span> : null}
      </span>
      <div className="h-1 w-full rounded-full bg-muted">
        <div className="h-full rounded-full bg-chart-3" style={{ width: `${Math.round((rate ?? 0) * 100)}%` }} />
      </div>
    </div>
  )
}

interface EngagementByInterestTableProps {
  rows: InterestEngagement[]
}

/** Not just what people generate, but how they engage with it: episodes, completion, likes. */
export function EngagementByInterestTable({ rows }: EngagementByInterestTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="pb-2 font-medium">Interest</th>
            <th className="pb-2 pl-3 text-right font-medium">Episodes</th>
            <th className="pb-2 pl-4 font-medium">Completion</th>
            <th className="pb-2 pl-4 font-medium">Like rate (ratings)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.interest} className="border-b border-border/60 last:border-0">
              <td className="py-2 pr-2">{row.interest}</td>
              <td className="py-2 pl-3 text-right tabular-nums">{formatCount(row.episodes)}</td>
              <td className="py-2 pl-4">
                <RateCell rate={row.completionRate} />
              </td>
              <td className="py-2 pl-4">
                <RateCell rate={row.likeRate} detail={`(${formatCount(row.ratings)})`} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
