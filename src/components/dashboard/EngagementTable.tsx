import { formatCount, formatPercent } from "@/lib/analytics/format"
import type { DimensionEngagement } from "@/types"

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

interface EngagementTableProps {
  rows: DimensionEngagement[]
  /** The header for the row-name column: "Interest", "Language", "Tone" or "Duration". */
  nameColumnLabel: string
}

/** Not just what people generate, but how they engage with it: podcasts, completion, likes. Shared by every Content & engagement dimension. */
export function EngagementTable({ rows, nameColumnLabel }: EngagementTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="pb-2 font-medium">{nameColumnLabel}</th>
            <th className="pb-2 pl-3 text-right font-medium">Podcasts</th>
            <th className="pb-2 pl-4 font-medium">Completion</th>
            <th className="pb-2 pl-4 font-medium">Like rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name} className="border-b border-border/60 last:border-0">
              <td className="py-2 pr-2">{row.name}</td>
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
